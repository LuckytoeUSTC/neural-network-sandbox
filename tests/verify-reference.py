#!/usr/bin/env python3
"""Independent numerical references for dist/model.js (no browser or LLM judge).

Run: python verify-reference.py
Requires Python 3, NumPy, SciPy and Node.js. The only Node code here is an
input/output bridge to the public model API. References use analytic solutions,
SciPy's DOP853/matrix exponential and NumPy/LAPACK; they do not call the model's
private integrators. All thresholds are explicit, and failures exit nonzero.

LIF tests deliberately distinguish continuous threshold times from grid-rounded
spike times. Conductance tests compare against the continuous ODE and require
second-order refinement, rather than claiming an exact voltage integrator.
OU tests distinguish the exact grid process from the held-input rate dynamics.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import expm


NODE_BRIDGE = r"""
const fs = require('node:fs');
const M = require(process.argv[1]);
const requests = JSON.parse(fs.readFileSync(0, 'utf8'));
const answers = requests.map(q => {
  if (q.action === 'simulate') {
    const r = M.simulate({...M.defaults, ...q.config});
    const answer = {weights: r.network.weights};
    for (const name of q.keep || ['stimulated']) answer[name] = r[name];
    return answer;
  }
  if (q.action === 'covariance') return M.covariance(q.samples);
  if (q.action === 'eigen') return M.eigenspectrum(q.matrix);
  if (q.action === 'measure') return M.measure(q.result, q.ids, q.options);
  throw new Error('Unknown reference-test action');
});
process.stdout.write(JSON.stringify(answers, (_, v) =>
  ArrayBuffer.isView(v) ? Array.from(v) : v));
"""

BASE = {
    "model": "linear", "topology": "custom", "n": 1, "m": 1,
    "matrixFormat": "edges", "matrix": "", "gain": 1,
    "initial": 0, "noise": 0, "bias": 0, "warmup": 0,
    "waveform": "off", "dt": 0.25, "sample": 0.25,
    "total": 40, "observeMode": "first", "pairing": "matched",
    "targets": "1", "observe": "1", "tau": 8,
}

LIF = {
    **BASE, "model": "lif", "capacitance": 200, "leak": 10,
    "rest": -65, "reset": -65, "threshold": -50,
    "reversalE": 0, "reversalI": -80,
    "tauE": 5, "tauI": 10, "refractory": 2, "delay": 1.5,
    "adapt": 0, "adaptTau": 120,
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def close(actual, expected, *, atol: float, label: str, rtol: float = 0) -> float:
    a, b = np.asarray(actual, dtype=float), np.asarray(expected, dtype=float)
    require(a.shape == b.shape, f"{label}: shape {a.shape} != {b.shape}")
    require(np.isfinite(a).all(), f"{label}: nonfinite values")
    error = float(np.max(np.abs(a - b))) if a.size else 0.0
    require(np.allclose(a, b, atol=atol, rtol=rtol),
            f"{label}: maximum absolute error {error:.9g}; atol={atol}, rtol={rtol}")
    return error


def simulate_request(config, keep=None):
    return {"action": "simulate", "config": config, **({"keep": keep} if keep else {})}


def rows(answer, n, run="stimulated"):
    return np.asarray(answer[run]["data"], dtype=float).reshape(-1, n)


class References:
    def __init__(self, model_path: Path):
        self.model_path = model_path

    def node(self, requests):
        completed = subprocess.run(
            ["node", "-e", NODE_BRIDGE, str(self.model_path)],
            input=json.dumps(requests, ensure_ascii=True, allow_nan=False),
            text=True, encoding="utf-8", capture_output=True,
            cwd=str(self.model_path.parent.parent), timeout=90,
        )
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
        return json.loads(completed.stdout)

    def linear_recurrence(self):
        # Asymmetric feedback, including inhibition. Row=target, column=source.
        weights = np.array([[0.2, -0.3, 0], [0.8, 0.1, 0.2], [0.1, 0, -0.1]])
        tau = 8.0
        generator = (weights - np.eye(3)) / tau
        drive = np.array([1.7, 0, 0]) / tau
        equilibrium = np.linalg.solve(generator, drive)

        def step_state(t):
            return (expm(generator * t) - np.eye(3)) @ equilibrium

        configs = []
        for waveform in ["step", "pulse"]:
            for dt in [1, 0.5, 0.25]:
                configs.append({**BASE, "n": 3, "m": 3, "tau": tau,
                    "matrixFormat": "dense", "matrix": "\n".join(
                        ",".join(map(str, row)) for row in weights),
                    "dt": dt, "sample": 1, "total": 40,
                    "waveform": waveform, "onset": 4, "width": 4,
                    "amplitude": 1.7})
        answers = self.node([simulate_request(c) for c in configs])
        errors = {}
        for config, answer in zip(configs, answers):
            close(answer["weights"], weights, atol=0, label="matrix orientation")
            expected = []
            for t in np.arange(41):
                if t <= 4:
                    expected.append(np.zeros(3))
                elif config["waveform"] == "step" or t <= 8:
                    expected.append(step_state(t - 4))
                else:
                    expected.append(expm(generator * (t - 8)) @ step_state(4))
            error = close(rows(answer, 3), expected, atol=8e-6,
                          label=f"linear {config['waveform']} dt={config['dt']}")
            errors.setdefault(config["waveform"], []).append(error)
        ratios = {}
        for waveform, values in errors.items():
            ratios[waveform] = [values[i] / values[i + 1] for i in [0, 1]]
            require(min(ratios[waveform]) > 14,
                    f"RK4 refinement not fourth order: {ratios}")
            require(values[-1] < 3e-8, f"fine-step linear error: {values[-1]}")
        return {"max_abs_error_by_dt_1_0p5_0p25": errors, "refinement_ratios": ratios}

    def nonlinear_rates(self):
        weights = np.array([[0.1, -0.6], [0.9, 0.25]])
        configs, references = [], []
        for model in ["tanh", "sigmoid"]:
            activation = np.tanh if model == "tanh" else lambda x: 1 / (1 + np.exp(-x))
            force = np.array([1.05, 0.15])
            solution = solve_ivp(
                lambda _t, x: (-x + weights @ activation(x) + force) / 5,
                (0, 20), np.zeros(2), t_eval=np.arange(0, 20.01, 0.5),
                method="DOP853", rtol=2e-13, atol=2e-14,
            )
            require(solution.success, "independent nonlinear reference did not solve")
            references.append(activation(solution.y).T)
            configs.append({**BASE, "n": 2, "m": 2, "model": model,
                "matrixFormat": "dense", "matrix": "0.1,-0.6\n0.9,0.25",
                "tau": 5, "bias": 0.15, "total": 20, "sample": 0.5,
                "dt": 0.125, "waveform": "step", "onset": 0, "amplitude": 0.9})
        answers = self.node([simulate_request(c) for c in configs])
        return {config["model"]: close(rows(answer, 2), reference,
                    atol=2e-9, label=f"{config['model']} vs DOP853")
                for config, answer, reference in zip(configs, answers, references)}

    def sinusoidal_drive(self):
        # The midpoint-held sine is second order in time even though the
        # autonomous rate solver is RK4. Compare to the continuous sine ODE.
        configs = [{**BASE, "tau": 20, "waveform": "sine", "onset": 0,
                    "width": 100, "total": 100, "frequency": 20,
                    "amplitude": 1, "dt": dt, "sample": 1}
                   for dt in [1, 0.5, 0.25]]
        answers = self.node([simulate_request(c) for c in configs])
        t = np.arange(101, dtype=float)
        omega, tau = 2 * math.pi * 20 / 1000, 20
        expected = (np.sin(omega*t) - omega*tau*np.cos(omega*t)
                    + omega*tau*np.exp(-t/tau)) / (1 + (omega*tau)**2)
        errors = [close(rows(a, 1)[:, 0], expected, atol=0.0005,
                        label="midpoint-held sine vs continuous analytic response")
                  for a in answers]
        ratios = [errors[i] / errors[i+1] for i in [0, 1]]
        require(min(ratios) > 3.9, f"sine refinement is not second order: {ratios}")
        require(errors[-1] < 4e-5, f"fine sine error: {errors[-1]}")
        return {"errors_by_dt_1_0p5_0p25": errors, "refinement_ratios": ratios}

    def lif_constant_current(self):
        configs = [{**LIF, "bias": 300, "reset": -68, "total": 200, "delay": 2,
                    "dt": dt, "sample": 1, "refractory": refractory}
                   for refractory in [0, 2] for dt in [1, 0.5, 0.25, 0.125]]
        answers = self.node([simulate_request(c) for c in configs])
        statistics = []
        for c, answer in zip(configs, answers):
            tau_m = c["capacitance"] / c["leak"]
            v_inf = c["rest"] + c["bias"] / c["leak"]
            first_exact = tau_m * math.log((v_inf - c["rest"]) / (v_inf - c["threshold"]))
            charging_exact = tau_m * math.log((v_inf - c["reset"]) / (v_inf - c["threshold"]))
            round_up = lambda t: math.ceil(t / c["dt"] - 1e-12) * c["dt"]
            first_grid = round_up(first_exact)
            period_grid = round_up(charging_exact) + c["refractory"]
            expected_spikes = np.arange(first_grid, c["total"] + 1e-10, period_grid)
            spikes = np.asarray(answer["stimulated"]["spikes"][0])
            close(spikes, expected_spikes, atol=1e-12, label="grid LIF spike times")
            require(0 <= first_grid - first_exact < c["dt"], "first spike quantization")
            require(0 <= period_grid - c["refractory"] - charging_exact < c["dt"],
                    "ISI quantization")
            expected_voltage = []
            for t in np.arange(c["total"] + 1):
                earlier = expected_spikes[expected_spikes <= t]
                if not len(earlier):
                    expected_voltage.append(v_inf + (c["rest"] - v_inf) * math.exp(-t / tau_m))
                else:
                    age = max(0, t - earlier[-1] - c["refractory"])
                    expected_voltage.append(v_inf + (c["reset"] - v_inf) * math.exp(-age / tau_m))
            voltage_error = close(rows(answer, 1)[:, 0], expected_voltage, atol=8e-13,
                                  label="constant-current subthreshold voltage")
            # Bin j is ((j-1)*sample, j*sample]; bin zero is empty.
            expected_counts = [0] + [int(np.sum((spikes > j - 1) & (spikes <= j)))
                                     for j in range(1, c["total"] + 1)]
            close(answer["stimulated"]["counts"], expected_counts,
                  atol=0, label="spike bin endpoint convention")
            statistics.append({"dt_ms": c["dt"], "refractory_ms": c["refractory"],
                "first_spike_ms": float(spikes[0]), "continuous_first_spike_ms": first_exact,
                "isi_ms": period_grid, "continuous_isi_ms": charging_exact + c["refractory"],
                "max_voltage_error_mV": voltage_error})
        return statistics

    @staticmethod
    def conductance_reference(c, times, weight, arrival, release=None):
        # An isolated target receives one analytically decaying conductance.
        tau_syn = c["tauE"] if weight > 0 else c["tauI"]
        reversal = c["reversalE"] if weight > 0 else c["reversalI"]
        begin = arrival if release is None else release
        initial_voltage = c["rest"] if release is None else c["reset"]
        expected = np.full(len(times), initial_voltage, dtype=float)
        active = np.asarray(times) > begin
        if not np.any(active):
            return expected

        def derivative(t, v):
            conductance = abs(weight) * math.exp(-(t - arrival) / tau_syn)
            return (c["leak"] * (c["rest"] - v) + conductance * (reversal - v)) / c["capacitance"]

        solution = solve_ivp(derivative, (begin, float(times[-1])), [initial_voltage],
            t_eval=np.asarray(times)[active], method="DOP853", rtol=2e-13, atol=2e-13,
            max_step=min(tau_syn / 3, 0.5))
        require(solution.success, "independent conductance reference did not solve")
        expected[active] = solution.y[0]
        return expected

    def lif_synaptic_arrivals(self):
        # 3400 pA gives a continuous first crossing at approximately 0.90 ms;
        # all tested grids therefore emit exactly one source spike at 1 ms.
        configs = [{**LIF, "n": 2, "m": 2, "matrix": f"1,2,{weight}",
                    "dt": 0.25, "sample": 0.25, "delay": delay,
                    "waveform": "pulse", "onset": 0, "width": 1,
                    "amplitude": 3400, "total": 20}
                   for weight in [2, -7] for delay in [0, 0.5, 2, 5]]
        answers = self.node([simulate_request(c) for c in configs])
        result = []
        for c, answer in zip(configs, answers):
            spikes = answer["stimulated"]["spikes"]
            close(spikes[0], [1], atol=0, label="single source spike")
            require(not spikes[1], "target must stay below threshold in arrival test")
            arrival = 1 + c["delay"]
            voltage = rows(answer, 2)[:, 1]
            arrival_index = round(arrival / c["sample"])
            close(voltage[:arrival_index + 1],
                  np.full(arrival_index + 1, c["rest"]), atol=0,
                  label="target voltage before and at arrival")
            weight = float(c["matrix"].split(",")[-1])
            require((voltage[arrival_index + 1] - c["rest"]) * weight > 0,
                    "wrong synapse sign or arrival delayed by an extra step")
            result.append({"weight_nS": weight, "delay_ms": c["delay"],
                           "arrival_ms": arrival, "first_voltage_change_ms": arrival + c["dt"]})

        # Reference to the continuous, exponentially decaying E/I conductance.
        configs = [{**LIF, "n": 2, "m": 2, "matrix": f"1,2,{weight}",
                    "tauE": 1, "tauI": 2, "dt": dt, "sample": 0.5,
                    "delay": 2, "waveform": "pulse", "onset": 0,
                    "width": 1, "amplitude": 3400, "total": 20}
                   for weight in [2, -7] for dt in [0.5, 0.25, 0.125]]
        answers = self.node([simulate_request(c) for c in configs])
        errors = {"excitatory": [], "inhibitory": []}
        for c, answer in zip(configs, answers):
            close(answer["stimulated"]["spikes"][0], [1], atol=0, label="reference source spike")
            weight = float(c["matrix"].split(",")[-1])
            times = np.arange(0, 20.01, 0.5)
            expected = self.conductance_reference(c, times, weight, 3)
            error = close(rows(answer, 2)[:, 1], expected, atol=0.008,
                          label="LIF vs continuous conductance ODE")
            errors["excitatory" if weight > 0 else "inhibitory"].append(error)
        ratios = {}
        for key, values in errors.items():
            ratios[key] = [values[i] / values[i + 1] for i in [0, 1]]
            require(min(ratios[key]) > 3.8, f"conductance refinement: {ratios[key]}")
            require(values[-1] < 0.0005, f"fine conductance voltage error: {values[-1]}")
        return {"arrival_cases": result,
                "voltage_error_mV_by_dt_0p5_0p25_0p125": errors,
                "refinement_ratios": ratios}

    def lif_refractory_and_warmup(self):
        c = {**LIF, "n": 2, "m": 2, "matrix": "1,2,2", "delay": 0.5,
             "waveform": "custom", "events": "0,1,3400,1 2", "total": 20}
        answer = self.node([simulate_request(c)])[0]
        close(answer["stimulated"]["spikes"], [[1], [1]], atol=0,
              label="both cells fire once before refractory arrival")
        voltage = rows(answer, 2)[:, 1]
        times = np.arange(0, 20.01, 0.25)
        refractory = (times >= 1) & (times <= 3)
        close(voltage[refractory], np.full(np.sum(refractory), c["reset"]),
              atol=0, label="refractory reset plateau including release boundary")
        expected = self.conductance_reference(c, times, 2, 1.5, release=3)
        error = close(voltage[times >= 3], expected[times >= 3], atol=0.0003,
                      label="conductance received and decayed during refractory")
        require(voltage[np.flatnonzero(times == 3.25)[0]] > c["reset"],
                "synapse arriving during refractory was incorrectly dropped")

        c = {**LIF, "n": 2, "m": 2, "matrix": "1,2,2", "delay": 2.5,
             "refractory": 2.5, "bias": 300, "sample": 0.5}
        full, warmed = self.node([simulate_request({**c, "total": 40}),
            simulate_request({**c, "total": 20, "warmup": 20})])
        warmup_error = close(rows(warmed, 2), rows(full, 2)[40:], atol=0,
                             label="negative-step warmup and queue continuity")
        for i in range(2):
            expected_spikes = [t - 20 for t in full["stimulated"]["spikes"][i] if t > 20]
            close(warmed["stimulated"]["spikes"][i], expected_spikes,
                  atol=0, label="warmup spike timestamp shift")
        return {"refractory_continuous_reference_error_mV": error,
                "warmup_suffix_error_mV": warmup_error}

    def lif_adaptation(self):
        # After one spike, a(t)=b*exp(-(t-1)/tau_a), including during the
        # refractory interval. The post-release membrane solution is analytic.
        configs = [{**LIF, "waveform": "pulse", "onset": 0, "width": 1,
                    "amplitude": 3400, "adapt": 64, "adaptTau": 5,
                    "total": 20, "dt": dt, "sample": 0.5}
                   for dt in [0.5, 0.25, 0.125]]
        answers = self.node([simulate_request(c) for c in configs])
        times = np.arange(0, 20.01, 0.5)
        age = times[times >= 3] - 3
        tau_m, tau_a = 20, 5
        convolution = (np.exp(-age/tau_a) - np.exp(-age/tau_m)) / (1/tau_m - 1/tau_a)
        expected = -65 - 64 / 200 * math.exp(-2/tau_a) * convolution
        errors = []
        for answer in answers:
            close(answer["stimulated"]["spikes"][0], [1], atol=0, label="single adaptation jump")
            voltage = rows(answer, 1)[:, 0]
            close(voltage[(times >= 1) & (times <= 3)], np.full(5, -65),
                  atol=0, label="adaptation evolves during fixed-voltage refractory")
            errors.append(close(voltage[times >= 3], expected, atol=0.0004,
                                label="exponential adaptation analytic voltage"))
        ratios = [errors[i] / errors[i+1] for i in [0, 1]]
        require(min(ratios) > 3.9, f"adaptation refinement is not second order: {ratios}")
        return {"voltage_errors_mV_by_dt_0p5_0p25_0p125": errors, "refinement_ratios": ratios}

    def ou_shared_input(self):
        configs = [{**BASE, "n": 6, "m": 6, "tau": 2,
                    "dt": 1, "sample": 1, "total": 12000,
                    "noise": 2.3, "noiseTau": 1, "shared": share,
                    "noiseSeed": 59013 + j}
                   for j, share in enumerate([0, 0.37, 1])]
        answers = self.node([simulate_request(c) for c in configs])
        statistics = []
        for c, answer in zip(configs, answers):
            x = rows(answer, c["n"])
            h = c["dt"] / c["tau"]
            # The known RK4 stability polynomial gives the held-drive inverse.
            decay = 1 - h + h*h/2 - h**3/6 + h**4/24
            drive = (x[1:] - decay * x[:-1]) / (1 - decay)
            rho = math.exp(-c["dt"] / c["noiseTau"])
            innovations = (drive[1:] - rho * drive[:-1]) / (
                c["noise"] * math.sqrt(1 - rho*rho))
            target = (1 - c["shared"]) * np.eye(c["n"]) + c["shared"] * np.ones((c["n"], c["n"]))
            innovation_covariance = np.cov(innovations, rowvar=False)
            innovation_error = close(innovation_covariance, target, atol=0.07,
                                     label="OU innovation covariance")
            mean_error = float(np.max(np.abs(np.mean(innovations, axis=0))))
            require(mean_error < 0.04, f"OU innovation mean {mean_error}")
            lag_product = np.mean(innovations[1:] * innovations[:-1], axis=0)
            lag_error = float(np.max(np.abs(lag_product)))
            require(lag_error < 0.035, f"OU innovations are not temporally white: {lag_error}")
            drive_error = close(np.cov(drive, rowvar=False) / c["noise"]**2,
                                target, atol=0.08, label="stationary OU drive covariance")
            if c["shared"] == 1:
                close(drive, np.repeat(drive[:, :1], c["n"], axis=1), atol=0,
                      label="fully shared OU signal")

            # Exact stationary variance of the discretely held OU-driven filter.
            # This is distinct from the continuous-OU result noiseTau/(tau+noiseTau).
            hold_variance = (1 - decay) / (1 + decay) * (1 + decay * rho) / (1 - decay * rho)
            state_error = close(np.cov(x[100:], rowvar=False) / c["noise"]**2,
                                hold_variance * target, atol=0.05,
                                label="held-input stationary rate covariance")
            statistics.append({"shared_fraction": c["shared"],
                "innovation_covariance_max_error": innovation_error,
                "innovation_mean_max_abs": mean_error,
                "innovation_lag1_max_abs": lag_error,
                "drive_covariance_max_error": drive_error,
                "rate_covariance_max_error": state_error,
                "held_ou_variance_factor": hold_variance,
                "continuous_ou_variance_factor": c["noiseTau"] / (c["tau"] + c["noiseTau"]),
                "samples": len(drive)})
        return statistics

    def paired_noise_response(self):
        c = {**BASE, "n": 2, "m": 2, "matrix": "1,2,0.8\n2,1,-0.3",
             "initial": 0.3, "noise": 1.2, "noiseTau": 3,
             "shared": 0.6, "warmup": 20, "total": 40,
             "waveform": "pulse", "onset": 4, "width": 8, "amplitude": 1.4}
        paired, deterministic = self.node([
            simulate_request(c, ["baseline", "stimulated"]),
            simulate_request({**c, "initial": 0, "noise": 0}, ["baseline", "stimulated"]),
        ])
        response = rows(paired, 2) - rows(paired, 2, "baseline")
        reference = rows(deterministic, 2) - rows(deterministic, 2, "baseline")
        return {"max_abs_superposition_error": close(response, reference, atol=3e-14,
                label="matched stochastic linear response equals deterministic response")}

    def covariance_and_eigenvalues(self):
        rng = np.random.default_rng(492071)
        regular = rng.normal(size=(701, 12)) @ rng.normal(size=(12, 12))
        offset = 1e9 + rng.normal(size=(401, 8))
        rank_deficient = rng.normal(size=(20, 96))
        sample_sets = [regular, offset, rank_deficient]
        covariance_results = self.node([{"action": "covariance", "samples": x.tolist()} for x in sample_sets])
        covariance_errors = []
        for name, values, actual, tolerance in zip(
                ["regular", "offset_1e9", "rank_deficient_96"], sample_sets,
                covariance_results, [2e-13, 7e-7, 4e-15]):
            reference = np.cov(values, rowvar=False, ddof=1)
            error = close(actual, reference, atol=tolerance, label=f"two-pass covariance {name}")
            covariance_errors.append({"case": name, "max_abs_error": error})

        q, _ = np.linalg.qr(rng.normal(size=(96, 96)))
        eigenvalues = np.r_[np.geomspace(1, 1e-12, 80), np.zeros(16)]
        psd = (q * eigenvalues) @ q.T
        matrices = [np.asarray(m) for m in covariance_results] + [psd, np.zeros((7, 7))]
        actual_eigenvalues = self.node([{"action": "eigen", "matrix": m.tolist()} for m in matrices])
        spectrum_errors = []
        for matrix, actual in zip(matrices, actual_eigenvalues):
            reference = np.linalg.eigvalsh(matrix)[::-1]
            scale = max(1, np.max(np.abs(reference)))
            error = close(actual, reference, atol=2e-12 * scale, label="Jacobi vs LAPACK eigenspectrum")
            require(min(actual) >= -2e-12 * scale, "non-PSD covariance eigenspectrum")
            require(abs(sum(actual) - np.trace(matrix)) <= 2e-11 * scale,
                    "eigenvalue trace not conserved")
            spectrum_errors.append({"dimension": len(actual), "max_abs_error": error})
        ranked = np.asarray(actual_eigenvalues[2])
        require(np.sum(ranked > 1e-10) <= 19, "covariance rank exceeds number of samples minus one")
        return {"covariance": covariance_errors, "eigenspectra": spectrum_errors}

    def observation_and_window_statistics(self):
        rng = np.random.default_rng(803151)
        n, sample, total = 8, 2, 120
        count = total // sample + 1
        baseline = rng.normal(size=(count, n)).cumsum(axis=0)
        stimulated = baseline + np.sin(np.arange(count)[:, None] / 7) * np.arange(1, n + 1)
        base_counts = rng.poisson(0.7, size=(count, n))
        stim_counts = rng.poisson(1.2, size=(count, n))
        base_counts[0] = stim_counts[0] = 0
        result = {"config": {"n": n, "sample": sample, "total": total},
                  "baseline": {"data": baseline.ravel().tolist(), "counts": base_counts.ravel().tolist()},
                  "stimulated": {"data": stimulated.ravel().tolist(), "counts": stim_counts.ravel().tolist()}}
        requests, references = [], []
        ids = [6, 0, 3]
        for kind in ["point", "mean", "integrated", "spike"]:
            for condition in ["baseline", "stimulated", "difference"]:
                options = {"start": 4, "end": 114, "window": 10,
                           "kind": kind, "condition": condition}
                source_a, source_b = (base_counts, stim_counts) if kind == "spike" else (baseline, stimulated)
                source = source_a if condition == "baseline" else source_b if condition == "stimulated" else source_b - source_a
                if kind == "point":
                    observations = source[2:58, ids]
                else:
                    observations = []
                    for p in range(2, 57 - 5 + 1, 5):
                        block = source[p + 1:p + 6, ids] if kind == "spike" else source[p:p + 5, ids]
                        value = block.sum(axis=0) * 100 if kind == "spike" else block.mean(axis=0)
                        if kind == "integrated":
                            value *= math.sqrt(0.01)
                        observations.append(value)
                    observations = np.asarray(observations)
                references.append((kind, condition, observations))
                requests.append({"action": "measure", "result": result, "ids": ids, "options": options})
        answers = self.node(requests)
        worst = 0
        for (kind, condition, values), answer in zip(references, answers):
            covariance = np.cov(values, rowvar=False)
            spectrum = np.linalg.eigvalsh(covariance)[::-1]
            worst = max(worst, close(answer["matrix"], covariance, atol=2e-11, rtol=2e-14,
                         label=f"{kind} {condition} covariance"))
            close(answer["spectrum"], spectrum, atol=4e-11, rtol=2e-14, label=f"{kind} spectrum")
            participation = np.trace(covariance)**2 / np.sum(covariance * covariance)
            require(abs(answer["dimensions"] - participation) < 2e-13,
                    f"participation ratio for {kind}")
            require(answer["samples"] == len(values), f"window count for {kind}")

        options = {"start": 4, "end": 114, "window": 10, "kind": "point", "condition": "baseline"}
        full, partial = self.node([{"action": "measure", "result": result, "ids": selected,
                                   "options": options} for selected in [list(range(n)), ids]])
        principal_error = close(partial["matrix"], np.asarray(full["matrix"])[np.ix_(ids, ids)],
                                atol=2e-14, label="partial observation principal submatrix")
        full_eigen, partial_eigen = np.asarray(full["spectrum"]), np.asarray(partial["spectrum"])
        require(np.all(partial_eigen <= full_eigen[:len(ids)] + 1e-12), "upper eigenvalue interlacing")
        require(np.all(partial_eigen >= full_eigen[n-len(ids):] - 1e-12), "lower eigenvalue interlacing")
        return {"measurement_cases": len(answers), "max_covariance_error": worst,
                "partial_principal_submatrix_error": principal_error,
                "eigenvalue_interlacing": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path(__file__).resolve().parent.parent / "dist" / "model.js")
    args = parser.parse_args()
    model = args.model.resolve()
    start = time.monotonic()
    original_hash = hashlib.sha256(model.read_bytes()).hexdigest()
    suite = References(model)
    tests = [
        ("linear_recurrence_analytic", suite.linear_recurrence),
        ("nonlinear_rate_dop853", suite.nonlinear_rates),
        ("sinusoidal_drive_analytic", suite.sinusoidal_drive),
        ("lif_analytic_isi_and_voltage", suite.lif_constant_current),
        ("lif_arrival_and_conductance_ode", suite.lif_synaptic_arrivals),
        ("lif_refractory_and_warmup", suite.lif_refractory_and_warmup),
        ("lif_adaptation_analytic", suite.lif_adaptation),
        ("ou_stationarity_and_shared_drive", suite.ou_shared_input),
        ("matched_noise_linear_superposition", suite.paired_noise_response),
        ("covariance_and_lapack_eigenspectrum", suite.covariance_and_eigenvalues),
        ("observation_windows_and_interlacing", suite.observation_and_window_statistics),
    ]
    results = []
    for name, test in tests:
        test_start = time.monotonic()
        try:
            metrics = test()
            results.append({"name": name, "passed": True, "metrics": metrics,
                            "seconds": round(time.monotonic() - test_start, 3)})
        except Exception as exc:
            results.append({"name": name, "passed": False,
                            "error": f"{type(exc).__name__}: {exc}",
                            "seconds": round(time.monotonic() - test_start, 3)})
    final_hash = hashlib.sha256(model.read_bytes()).hexdigest()
    unchanged = original_hash == final_hash
    all_passed = all(row["passed"] for row in results) and unchanged
    report = {"passed": all_passed, "model": str(model), "model_sha256": original_hash,
              "model_unchanged_during_tests": unchanged,
              "reference_backends": {"python": sys.version.split()[0], "numpy": np.__version__,
                  "scipy": __import__("scipy").__version__, "node": subprocess.check_output(
                      ["node", "--version"], text=True).strip()},
              "groups_passed": sum(row["passed"] for row in results), "groups_total": len(results),
              "seconds": round(time.monotonic() - start, 3), "results": results,
              "limits": [
                  "Finite reference cases and seeded statistical checks are not a proof for every parameter combination.",
                  "LIF spike timestamps are grid-rounded; continuous voltage agreement is convergence-tested.",
                  "OU grid transitions are exact, while the input is held constant within each integration step.",
                  "Sample covariance of autocorrelated records is not claimed to be an unbiased ensemble estimator.",
                  "Partial-observation eigenvalues describe the selected principal submatrix, not the full hidden network.",
              ]}
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
