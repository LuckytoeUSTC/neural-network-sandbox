(() => {
  "use strict";

  globalThis.NeuroTheory = {
    zh: String.raw`
 <section aria-labelledby="theory-models">
 <h3 id="theory-models">Model 描述了什么</h3>

 <p>每次实验在同一张 directed network 上比较 baseline 与 stimulus 两种条件。Network size、单个 neuron 的 dynamics、connectivity、input 和记录位置都可以编辑。Preset 提供可直接运行的起始参数。</p>

 <h4>Rate models</h4>

 <p>Rate model（连续率模型）的 internal state 是 \(x_i\)，传给其他 neuron 的 activity 是 \(r_i = \phi(x_i)\)。input 由 recurrent coupling、background drive \(b\)、noise \(\eta_i\) 和 stimulus \(u_i\) 组成；leak 项 \(-x_i\) 使 state 自行衰减。</p>

 <div class="equation">\[
        \begin{aligned}
        \tau\frac{\mathrm{d}x_i}{\mathrm{d}t}
          &= -x_i + \sum_j J_{ij}r_j + b + \eta_i(t) + u_i(t), \\
        r_i &= \phi(x_i).
        \end{aligned}
      \]</div>
 <ul>
 <li><strong>Linear rate：</strong> \(\phi(x) = x\)，适合观察 propagation、feedback 和 small-perturbation response。</li>

 <li><strong>Tanh rate：</strong> \(\phi(x) = \tanh(x)\)，输出在 \(-1\) 与 \(1\) 之间。负值表示相对 reference level 的负向 activity。</li>

 <li><strong>Sigmoid rate：</strong> \(\phi(x) = \frac{1}{1 + \exp(-x)}\)，输出在 \(0\) 与 \(1\) 之间。</li>

 </ul>
 <p>后两种 model 的 output 会达到 saturation，internal state \(x\) 没有被截断。Traces 记录 \(r\)，initial state 的 standard deviation 控制 \(x\) 在零附近的 Gaussian distribution。例如 Sigmoid rate 中， \(x = 0\) 对应 \(r = 0.5\)。</p>

 <p> \(x\)、 \(r\)、 \(J\)、 \(b\)、 \(\eta\) 和 \(u\) 均为 dimensionless；这里的 rate 没有换算成 \(\mathrm{Hz}\)。时间和 \(\tau\) 以 \(\mathrm{ms}\) 计。 \(\tau\) 控制 internal state 的 relaxation rate，不直接等同于 LIF 的 membrane time constant。</p>

 <p>Linear rate 的 stability 由 \(J\) 的 eigenvalue 决定：全部 real part 小于 1，homogeneous perturbation 才会渐近衰减。nonlinear model 还取决于当前 state 处的 \(\phi'\)。因此，同一个 global gain 在不同 topology 下可以有不同的 stability；irregular trajectory 也不能单独作为 chaos 的判据。</p>

 <h4>Conductance-based LIF</h4>

 <p>Conductance-based LIF（电导型漏积分发放模型）计算 membrane potential \(V\)。membrane capacitance 储存 charge；leak、excitatory 和 inhibitory conductance 分别将 membrane potential 拉向各自的 reversal potential： \(E_{\mathrm{L}}\)、 \(E_{\mathrm{E}}\) 与 \(E_{\mathrm{I}}\)。</p>

 <p>Membrane potential 达到 threshold 时记一次 spike，随后 reset，并在 refractory period 内维持 reset value。这里的 spike 是一个事件，不包含 action potential 的完整 waveform。</p>

 <div class="equation">\[
        C_{\mathrm{m}}\frac{\mathrm{d}V_i}{\mathrm{d}t}
          = g_{\mathrm{L}}(E_{\mathrm{L}} - V_i)
          + g_{\mathrm{E},i}(E_{\mathrm{E}} - V_i)
          + g_{\mathrm{I},i}(E_{\mathrm{I}} - V_i)
          + b + \eta_i(t) + u_i(t) - a_i.
      \]</div>
 <p>membrane potential \(V\)、reversal potential、reset 和 threshold 都用 \(\mathrm{mV}\)，membrane capacitance \(C_{\mathrm{m}}\) 用 \(\mathrm{pF}\)，conductance 用 \(\mathrm{nS}\)。background drive、stimulus 和 adaptation current \(a\) 用 \(\mathrm{pA}\)。时间采用 \(\mathrm{ms}\)，equation 两边的单位一致。</p>

 <p>没有 synaptic input 时，membrane time constant 为 \(C_{\mathrm{m}} / g_{\mathrm{L}}\)。例如 \(200\,\mathrm{pF}\) 与 \(10\,\mathrm{nS}\) 对应 \(20\,\mathrm{ms}\)。增加 conductance 既改变 membrane potential 趋向的值，也缩短 effective time constant。</p>

 <p>presynaptic spike 经过设定的 delay 到达后，正边使 excitatory conductance 增加 \(J_{ij}\,\mathrm{nS}\)，负边使 inhibitory conductance 增加 \(\lvert J_{ij}\rvert\,\mathrm{nS}\)。两类 conductance 按各自的 time constant 做 exponential decay。inhibitory current 的方向取决于 \(V\) 与 \(E_{\mathrm{I}}\) 的差，因此负边不代表固定的负 current。</p>

 <p>每次 spike 还可增加设定量的 adaptation current，随后按 adaptation time constant 衰减。增量设为零，就关闭这项 feedback。</p>

 <p>State 与 rate 的区分改写自温泉 <cite>Attractor Dynamics and Recurrent Networks</cite> 第 1–3 页。time constant 的含义取决于保留的 dynamical variable；具体 equation 和单位以本程序为准。LIF 和 conductance synapse 的标准定义见<a href="https://neuronaldynamics.epfl.ch/online/Ch1.S3.html" target="_blank" rel="noopener noreferrer">Neuronal Dynamics §1.3</a>、<a href="https://neuronaldynamics.epfl.ch/online/Ch3.S1.html" target="_blank" rel="noopener noreferrer">§3.1</a>。</p>

 </section>


 <section aria-labelledby="theory-connectivity">
 <h3 id="theory-connectivity">Connection direction 与 topology</h3>

 <p>connectivity matrix \(J\) 的<strong>行是 postsynaptic neuron，列是 presynaptic neuron</strong>： \(J_{ij}\) 表示 \(j \to i\)。整体 gain 在生成 network 后乘到每一条边，包括 custom connectivity。Rate model 允许负 gain；LIF 要求 gain 非负，并用边的符号区分 excitatory 与 inhibitory conductance。</p>

 <ul>
 <li><strong>Directed ring / Feedforward chain：</strong>按编号依次连成 \(1 \to 2 \to \cdots \to N\)，ring 再接上 \(N \to 1\)，形成返回上游的路径。基准 edge weight 为 1；relative jitter \(\delta\) 使它乘上从 \([1 - \delta,\,1 + \delta]\) uniform 抽取的因子。</li>

 <li><strong>Random：</strong>off-diagonal 位置以 probability \(p\) 连边，edge weight 取 zero-mean Gaussian distribution，standard deviation 为 \(\frac{1}{\sqrt{\max(1, pN)}}\)。两个方向独立生成，不强制 reciprocity，也不按 neuron 固定输出符号。</li>

 <li><strong>E/I：</strong>前 \(\lfloor fN \rfloor\) 个 neuron 为 \(\mathrm{E}\)，其余为 \(\mathrm{I}\)， \(f\) 是 excitatory neuron fraction。presynaptic neuron 决定出边符号； \(\mathrm{I}\) 边的基准 absolute value 是 \(\mathrm{E}\) 边的“I/E weight ratio”倍。再应用 Random 的 scale factor 和可选 relative jitter。neuron fraction 和 weight ratio 都不直接等于实际 current 的 E/I balance。</li>

 <li><strong>Clustered：</strong>按编号分成近似等大的 cluster。cluster 内基准 weight 为正，cluster 间 weight 再乘“between/within weight ratio”：零表示断开，负值表示负向作用。off-diagonal 位置以 probability \(p\) 连边，weight 除以 \(\max(1, pN / \text{cluster count})\)，并可加入 relative jitter。</li>

 <li><strong>Low-rank：</strong>structured term 由 \(k\) 个 random \(\pm 1\) vector 的 outer product 相加，每项除以 \(N\)，包含 diagonal entry。这个 structured term 是 symmetric 的，rank 至多为 \(k\)；项数本身不保证这些 vector 彼此 linearly independent。另在 off-diagonal 位置叠加 sparse Gaussian background。background strength 和 connection probability 只控制 background term，整体 gain 则同时作用于两部分。</li>

 <li><strong>Custom：</strong>edge list 每行写“source, target, weight”；完整 matrix 仍按“行是 target、列是 source”。未填写的边为零，可包含 self-connection。Custom 和 Random 都不会自动遵守 E/I 的 neuron type 约束。</li>

 </ul>
 <p>相同生成方式、参数和 network seed 给出同一张 network。改变规模、connection probability 或 topology 后，相同 seed 不保证边逐一对应。图上的 neuron 位置只用于排版，不代表脑区坐标或距离。</p>

 </section>


 <section aria-labelledby="theory-input">
 <h3 id="theory-input">OU input 与 paired stimulus</h3>

 <p>background drive \(b\) 是所有 neuron 持续接受的常量。background noise \(\eta\) 采用 Ornstein–Uhlenbeck process，简称 OU。 \(\sigma\) 控制单个 neuron input 的 stationary standard deviation， \(\tau_\eta\) 控制 correlation time， \(c\) 是 shared noise 的 variance 占比。</p>

 <p>shared component \(z_0\) 和各 neuron 的 private component \(z_i\) 相互 independent，都具有 unit stationary variance：</p>

 <div class="equation">\[
        \begin{gathered}
        \eta_i(t) = \sigma\bigl[\sqrt{c}\,z_0(t) + \sqrt{1-c}\,z_i(t)\bigr], \\
        \operatorname{Cov}\bigl[\eta_i(t),\eta_j(t+s)\bigr]
          = \sigma^2\bigl[c + (1-c)\delta_{ij}\bigr]
            \exp\!\left(-\frac{|s|}{\tau_\eta}\right).
        \end{gathered}
      \]</div>
 <p> \(c = 0\) 时，各 neuron 的 background input 独立； \(c = 1\) 时，波动完全共享。它控制的是 input correlation，network activity 的 correlation 还取决于 recurrent circuit 和 nonlinearity。</p>

 <p>增大 correlation time 会让 input 更慢，但保留其 stationary standard deviation。这个操作没有固定 white noise 的强度， \(\sigma\) 也不能直接当作 white noise model 的 diffusion coefficient。</p>

 <p>Stimulus \(u\) 只加到指定 neuron。Pulse 在指定区间保持 amplitude，step 持续到记录结束。Paired pulse 的间隔按两次起点计算；间隔小于宽度时，重叠部分相加。</p>

 <p>Sine 在指定区间内从 zero phase 开始，frequency 以 \(\mathrm{Hz}\) 计，amplitude 是正负峰值。Custom sequence 每行给出开始、持续、amplitude 和目标，多段事件可以叠加。</p>

 <p>stimulus onset 从正式记录的 \(0\,\mathrm{ms}\) 起算，warm-up 中没有 stimulus。关闭 stimulus 只令 \(u = 0\)，background drive 和 noise 仍保留。Rate model 的 input 为 dimensionless，LIF input 用 \(\mathrm{pA}\)。这些 waveform 直接进入 model equation，不包含 stimulator 或 receptor model。</p>

 <p><strong>Paired</strong>比较固定 network、initial state 和 background input，只在 stimulus 条件加入 \(u\)，所以 stimulus 前两条 trajectory 相同。之后的差异包含直接 response 和 network propagation。<strong>Independent</strong>仍固定 network，但分别抽取 initial state 与 background input。</p>

 <p>Baseline 是同一 network 在不加 stimulus 时的完整运行，仍保留 bias、noise 和内部 dynamics，因此可以持续波动。它与从刺激前区间估计的均值是两个不同对象。</p>

 <p>Paired 的 Difference 表示固定这次 background 后加入 stimulus 的轨迹变化：linear model 中共同的加性噪声会抵消，nonlinear model 中则还包含状态依赖的 trajectory separation，不能理解为脱离背景的“纯刺激成分”。Independent 的单次差值还包含两次 initial state 和 noise 的差异。估计平均效应和不确定性需要重复实验。</p>

 <p>LIF 的瞬时电位差还受 spike timing 和 reset 影响；binned-rate difference 描述的是另一种统计量。刺激也可能改变自发波动本身，参见 <a href="https://doi.org/10.1103/PhysRevE.82.011903" target="_blank" rel="noopener noreferrer">Rajan、Abbott 与 Sompolinsky（2010）</a>。</p>

 </section>


 <section aria-labelledby="theory-numerics">
 <h3 id="theory-numerics">Numerical integration 与 spike timing</h3>

 <p>integration step 控制 state 如何推进，sampling interval 控制多久保存一次 continuous variable。更密的记录不能修复过粗的 integration step。Warm-up 在正式记录前运行同一 model，帮助 initial state 影响衰减；是否已达到 stationary state，仍需检查。</p>

 <p>Rate model 使用 RK4，即 fourth-order Runge–Kutta 方法。Pulse 和 step 在 integration grid 上切换；sine 每步取中点值，并保持一整步。OU 则用 exact Gaussian transition 更新网格值，integration 时保持左端 input。因此，“exact OU transition”和“RK4”都不意味着含 noise 的系统整体具有 fourth-order accuracy。</p>

 <p>LIF 先接收本步到达的 spike，再计算 conductance 和 adaptation current 的 exponential decay。Membrane potential 采用 exponential update，其中这两类变量近似固定为步中点值。步末检查 threshold；达到 threshold 就记录 spike 并 reset。</p>

 <p>synaptic event 从已记录的 spike 时刻起，再经过设定的 delay 到达目标。零 delay 在下一个 integration interval 开始时生效。Refractory period 内 membrane potential 保持 reset 值，但 conductance、adaptation current 和 input 继续演化。</p>

 <p>Spike time 落在 integration grid 上，未对步内 threshold crossing 插值；每个 neuron 每步最多发放一次。较短的 latency、高 firing rate 或 synchrony 需要用更小的 integration step 复查。</p>

 <p>改变 integration step 也改变了 random number 的使用顺序。同一 seed 不会保留完全相同的连续 noise path，所以两条 trajectory 的逐点差异不能全部归为 integration error。</p>

 </section>


 <section aria-labelledby="theory-recording">
 <h3 id="theory-recording">Recording：神经元子集与投影通道</h3>

 <p>模拟始终演化完整 network，未被单独记录的 neuron 仍通过 recurrent circuit 影响观测。Recording 中的 Readout 决定如何从这些活动读取 \(m\) 个通道。用 \(z(t)\) 表示当前统计所使用的全网 activity vector，\(N\) 为 neuron 数，固定读出矩阵为 \(R\in\mathbb{R}^{m\times N}\)：</p>

 <div class="equation">\[
        \begin{aligned}
        y(t) &= Rz(t), \\
        C_y &= RC_zR^T.
        \end{aligned}
      \]</div>
 <p>选择 neuron 时，\(R\) 每行只取一个原坐标，读出 covariance 是全网 covariance 的 principal submatrix；投影时，每个通道混合多个 neuron。只要使用相同样本、中心化和归一化，上述 covariance 关系对有限数据也严格成立。两种读出都作用于完整网络产生的轨迹；隐藏 neuron 的 recurrent 影响仍保留在观测中。</p>

 <ul>
 <li><strong>Random subsampling：</strong>Random spatial subsampling（随机空间子采样）从全网均匀、无放回地选取 \(m\) 个不同 neuron，保留其原始数值。这是 Hu–Sompolinsky 正文 §3.7 研究的记录方式。</li>

 <li><strong>Random orthogonal projection：</strong>随机正交投影，界面简称 Random orth. projection。它从 Haar 分布的随机正交基中取 \(m\) 个方向，满足 \(RR^T=I_m\)。每个通道是带正负权重的活动混合，不再对应一个 neuron。这里没有额外的 \(\sqrt{N/m}\) 放大：若全网 covariance 为 \(I_N\)，读出恰为 \(I_m\)；若 \(m=N\)，它只是更换正交坐标，所有 covariance eigenvalue 和 participation ratio 都保持不变。</li>

 <li><strong>i.i.d. Gaussian projection：</strong>各权重独立地取 \(R_{ai}\sim\mathcal{N}(0,1/N)\)。i.i.d. 是 independent and identically distributed，即“独立同分布”；\(1/N\) 是 variance，standard deviation 为 \(1/\sqrt N\)。这些行不再归一化或正交化。仅当 \(N\) 较大且 \(m/N\ll1\) 时，它们才近似正交；若 \(m/N\) 保持为非零比例，两类投影的谱一般不同。即使 \(m=N\)，Gaussian projection 也通常会改变 eigenvalue。</li>
 </ul>

 <p><strong>Manual subset、First neurons、Evenly spaced subset、Within-group subset</strong> 是本沙盒的其他选坐标方式，论文没有把它们分别列为自己的采样方法。按编号等间隔不一定意味着物理空间上等间隔；Within-group subset 按编号取指定组的前 \(m\) 个可用成员。有 cluster、ring 或局部 stimulus 时，记录位置会影响结果；只记录一个 cluster 也不能代表全网平均活动。</p>

 <p>论文中随机选 neuron 与随机正交投影的谱等价依赖随机系综的旋转不变性及相应的大网络条件，不表示同一个有限网络的两种读出必有相同 eigenvalue。Gaussian projection 是补充材料另行讨论的变体，有自己的近似适用范围。这里把这些读出用于其他 topology 和 nonlinear model，是为了直接比较观测方式的影响；显示结果仍由模拟数据计算。定义与条件见<a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">Hu 与 Sompolinsky（2022），§3.7，pp. 14–15</a>和<a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text，§I，cases (i)–(iii)，Eqs. (S101)–(S102)，pp. 30–31</a>。</p>

 <p>Readout seed 独立于 network seed 和 noise seed，只控制随机子集或投影权重。一次读出在 Baseline、Stimulus 和 Difference 中使用同一个 \(R\)。完成模拟后，更改 Recording 可重读已有数据，无需重新积分；Export readout matrix 导出本次使用的确切 \(R\)，便于复查通道的组成。</p>

 <ul>
 <li><strong>Traces：</strong>选择 neuron 时，rate model 显示 \(r\)，LIF 显示 membrane potential \(V\)；投影时显示它们的线性混合。投影电位没有自己的 threshold 或 reset。记录较稀时可能漏掉真实 neuron 的 spike 前电位升高，reset trajectory 也不能代替 spike events。Show stimulus 只显示指令输入 \(u\)，投影时为对应通道的 \(Ru\)，不含 background input。</li>

 <li><strong>Raster：</strong>rate model 用 heatmap 表示 activity；LIF 的 neuron 子集显示真实 spike raster，temporal resolution 由 integration step 决定。投影模式使用连续活动的 heatmap，包括 LIF 的混合电位，不为投影通道制造 spike events。</li>

 <li><strong>Population：</strong>rate model 对当前 neuron 或投影通道取 instantaneous mean，正负值可能抵消。LIF 先在不重叠完整 window 内计数，再除以窗口秒数；neuron 子集按记录人数取平均，投影模式则先线性混合各 neuron 的窗口速率，再对通道取平均。Mean projected rate 是通道均值，依赖所选方向、可能为负，不是真实 neuron 群体的平均 firing rate。窗口结果位于窗中心。</li>

 <li><strong>Connectivity：</strong>有向图和 matrix 始终显示原网络的 \(J\)。Nodes 及投影模式下的全屏数据表显示真实 neuron 的模型状态；混合通道不对应单个 node。Covariance 还包含间接路径、input 和 sampling 的影响，不能按 connectivity matrix 来读。</li>
 </ul>

 <p>这个比较思路改写自春季课程 <cite>Homework 2: Neural Population Dynamics, jPCA, and RNN Models of Motor Cortex</cite>。沙盒采用其中通过条件对照比较 dynamics 的思路；课程中的 jPCA 和任务训练属于独立分析。</p>

 </section>


 <section aria-labelledby="theory-covariance">
 <h3 id="theory-covariance">Covariance 的 sample 是什么</h3>

 <p>所选区间提供 \(M\) 个 sample，每个是包含 \(m\) 个读出通道的 vector；只有选取 neuron 子集时，通道才直接对应 neuron。程序对每个通道减去这 \(M\) 个 sample 的 mean，再以 \(M-1\) 为分母计算 sample covariance。Diagonal 是通道的 variance，off-diagonal entry 描述通道之间的共同变化。这里没有按各通道的 standard deviation 归一化，因此得到的是 covariance matrix，而非 correlation matrix。</p>

 <p>论文在 S1 Text §H 的理论推导中使用已知零均值样本的 \(XX^T/M\)，不减去样本均值；正文 Eq. (37) 对实际数据则采用样本中心化和分母 \(M-1\)，与本程序一致。有限 \(M\) 时，两种估计器不能直接当作同一个量。</p>

 <ul>
 <li><strong>Equal-time：</strong>每个保存时刻提供一个 vector。Rate model 使用 \(r\)，LIF 使用 \(V\)，投影时取对应的 \(Rr\) 或 \(RV\)；区间两端的 sample point 都计入。</li>

 <li><strong>Window mean：</strong>每个不重叠 window 提供一个 mean vector。Continuous variable 对窗内左端记录点取 arithmetic mean，末尾不完整的 window 舍弃。固定线性投影与窗口平均可交换次序。</li>

 <li><strong>Integrated：</strong>将 Window mean covariance 乘以 window duration 的秒数，得到 finite-window integrated covariance 估计。</li>

 <li><strong>Binned rate：</strong>仅用于 LIF。每个 neuron 在完整 window 内的 spike 数除以窗口秒数，得到 \(\mathrm{Hz}\) 单位的速率，再按当前 Readout 读取或混合这些速率。投影后的 signed rate 可以为负，不是某个新 neuron 的 firing rate。每窗包含右边界、排除左边界的 spike；这一统计不同于 membrane potential covariance。</li>

 </ul>
 <p>对减去 ensemble mean 的 stationary activity \(y(t)\)，用 \(K(s)\) 表示 lag 为 \(s\) 的 covariance， \(T\) 表示以秒计的 window width：</p>

 <div class="equation">\[
        \begin{aligned}
        \bar y_T &= \frac{1}{T}\int_0^T y(t)\,\mathrm{d}t, \\
        C_T &= T\operatorname{Cov}(\bar y_T)
             = \int_{-T}^{T}\left(1-\frac{|s|}{T}\right)K(s)\,\mathrm{d}s.
        \end{aligned}
      \]</div>
 <p>window 很短时，window mean 的 population covariance 接近 equal-time 值 \(K(0)\)。若过程满足 stationarity 且 lagged covariance 可积， \(C_T\) 在 long-window limit 中趋向全部 lag 的 integral，即该 Fourier normalization 下 zero frequency 处的 power spectrum matrix。finite-window 仍带有 triangular weighting，结果依赖 window width。</p>

 <p>程序先将 \(\mathrm{ms}\) 转为秒再相乘。Membrane potential 的 Equal-time 和 Window mean 单位为 \(\mathrm{mV}^2\)，Integrated 为 \(\mathrm{mV}^2\!\cdot\!\mathrm{s}\)，Binned rate 为 \(\mathrm{Hz}^2\)。Rate activity 对应 dimensionless 平方，或其乘秒的单位。\(R\) 的权重无量纲，所以投影保留这些单位。</p>

 <p>论文主要研究 long-window integrated covariance，也称 zero-frequency covariance，而非 equal-time covariance。其 Eq. (37) 将 spike-count covariance 除以窗口时长 \(T\)，等价于将 rate covariance 乘以 \(T\)；本程序未经这一步缩放的 Binned rate covariance 是另一种归一化。Integrated estimate 随窗口宽度变化，其长期收敛条件见上面的 lagged covariance 积分。参见<a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">正文 §2.1，Eq. (2)，p. 3；§5.6，Eq. (37)，p. 24</a>。</p>

 <p>“stimulus − baseline”先逐点相减，再计算差值的 covariance。它<strong>不等于两张 covariance 之差</strong>，因为还涉及两条 trajectory 的 cross-covariance。</p>

 <p>包含 stimulus 起止或明显漂移的区间，也会把随时间变化的平均 response 计入 covariance。此时 covariance 同时包含随时间变化的 response 和波动；研究 stationary spontaneous fluctuations 时，需要另外选取符合平稳条件的区间。</p>

 <p>equal-time statistics 与 window normalization 的说明改写自本地《随机循环网络协方差谱：理论推导与适用范围》第 1、5 节，原始研究见<a href="https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">Hu 与 Sompolinsky（2022）</a>。本程序从 colored input 下的有限时长轨迹估计统计量；white-noise 理论的条件与这里的输入定义需要分别核对。</p>

 </section>


 <section aria-labelledby="theory-spectrum">
 <h3 id="theory-spectrum">Eigenspectrum 与 participation ratio</h3>

 <p>Covariance 的 eigenvalue \(\lambda\) 是沿各 orthogonal direction 的 activity variance。Eigenspectrum 将它们排序，但不保留这些方向在 neuron coordinates 中的构成。一个大的 eigenvalue 说明某个方向承载了较多波动，不能单独指定一条 connection、neuron type 或机制。</p>

 <div class="equation">\[
        D = \frac{\left(\sum_k \lambda_k\right)^2}{\sum_k \lambda_k^2}.
      \]</div>
 <p>Participation ratio \(D\) 衡量 variance 分散在多少个方向上。只有一个方向有 variance 时， \(D = 1\)； \(k\) 个方向 variance 相同、其余为零时， \(D = k\)。它可以是非整数，也不同于按累计 variance threshold 保留的 PC 数。总 variance 为零时无定义，界面显示空值。</p>

 <p>Participation ratio 的定义与解释参考温泉 <cite>Geometry of Population Neural Activity and Analysis Methods</cite> 第 21 页。</p>

 <p>读出 \(m\) 个通道时，\(D\) 不超过 \(m\)。对 \(M\) 个 sample 减去 sample mean 后，covariance 的 rank 至多为 \(\min(m,M-1)\)；sample 很少时，zero eigenvalue 可能只来自这个 rank 上限。</p>

 <p><strong>Spatial sampling</strong> 决定观察哪些 neuron 或活动方向；<strong>temporal sampling</strong> 决定有多少个 vector 可用于估计 covariance。令读出维数比例 \(f=m/N\)，论文在全网上定义 \(\alpha=N/M\)，读出后的时间采样比例则为 \(m/M=f\alpha\)。Equal-time 的 \(M\) 是保存的 vector 数，窗口统计的 \(M\) 是完整 window 数，不能直接用 integration step 数代替。即使记录全网，有限时间采样问题仍然存在。</p>

 <p>论文有限时间采样的推导假设不同 sample column 相互独立且服从 Gaussian distribution。实际 trajectory 的相邻时刻、甚至相邻不重叠 window，仍可能有 temporal correlation；\(M\) 个观测不等于已确认的 \(M\) 次独立重复，分母 \(M-1\) 也不能消除相关性影响。增加保存频率不会按相同比例增加独立信息。参见<a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">正文 §3.7，Eqs. (22)–(23)，p. 14</a>和<a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text，§H，pp. 26–29；§I.2，Eq. (S107)，p. 32</a>。</p>

 <p>固定记录总时长后，加宽 window 同时减少 sample count、改变被估计的 population covariance，两者都会影响 eigenspectrum 和 \(D\)。比较时应一起报告 Readout、通道数、sample count、时间区间、window width 和统计类型。</p>

 <p>Absolute dimension \(D\) 与 relative dimension \(D/m\) 可以反向变化。论文在相应随机空间压缩的大网络极限中得到 \(D\) 下降而 \(D/m\) 上升的趋势，但这不是每个有限网络、每个任选子集都满足的定理，也不表示恢复了未观测的信息。详见<a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text，§I.1，Eqs. (S104)–(S105)，pp. 31–32</a>。三个通道至多提供三个 eigenvalue，无法据此确立 large-network spectral density 的 tail exponent。</p>

 <p>共同波动可能来自 recurrent coupling，也可能来自 shared input，单张 covariance 不能唯一反推完整 connectivity。这部分改写自本地《少量神经元能留下哪些谱信息》；页面数值由当前配置的模拟产生，本地材料中的独立实验提供解释背景。</p>

 </section>


 <section aria-labelledby="theory-sources">
 <h3 id="theory-sources">Preset 与参考文献</h3>

 <p>Preset 提供以下 model 家族的可编辑实例。各项对应关系列在下方；论文图、phase diagram 和 critical value 的比较还需要匹配原文的参数、规模与输入条件。</p>

 <ul>
 <li><a href="https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.61.259" target="_blank" rel="noopener noreferrer">Sompolinsky、Crisanti 与 Sommers（1988）</a>：random rate network 与 chaos。本程序的 network 规模有限，可设为 sparse，也可接受 stimulus 和 colored input；相近的 equation 不保证当前参数处于论文的 chaotic phase。</li>

 <li><a href="https://arxiv.org/abs/1711.09672" target="_blank" rel="noopener noreferrer">Mastrogiuseppe 与 Ostojic（2018）</a>：low-rank connectivity 与 dynamics。本程序采用同一 sign vector 的左右 outer product，是特殊的 symmetric 结构，未实现一般的左右 vector geometry 或论文中的计算任务。</li>

 <li><a href="https://link.springer.com/article/10.1023/A:1008925309027" target="_blank" rel="noopener noreferrer">Brunel（2000）</a>：sparse E/I spiking network。本程序使用 conductance synapse、OU background 及可选 adaptation，model 条件与原文不同。</li>

 <li><a href="https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">Hu 与 Sompolinsky（2022）</a>：linear recurrent network 的 covariance eigenspectrum 和 finite sampling。本程序从 trajectory 计算 finite-window 统计，用于比较读出方式、统计窗口和通道数的影响。</li>

 </ul>
 <p>Ring、chain、clustered 和 single-neuron adaptation 是按本程序 equation 构造的配置，不对应某篇论文的完整 model。标明“改写自”的段落来自本地课程或项目材料，其余说明针对当前实现撰写。春季材料的来源见<a href="https://github.com/Wenlab/Computation-Neuro-Course/blob/Spring-2026/README.md" target="_blank" rel="noopener noreferrer">Wenlab Computational Neuroscience Course</a>。</p>

 </section>
`,
    en: String.raw`
 <section aria-labelledby="theory-models">
 <h3 id="theory-models">What the models describe</h3>

 <p>Each experiment compares baseline and stimulus conditions on the same directed network. You can edit the network size, individual neuron dynamics, connectivity, inputs, and recording locations. Presets provide starting parameters.</p>

 <h4>Rate models</h4>

 <p>A rate model has an internal state \(x_i\) and transmits activity \(r_i = \phi(x_i)\) to other neurons. Its inputs comprise recurrent coupling, a background drive \(b\), noise \(\eta_i\), and a stimulus \(u_i\). The leak term \(-x_i\) makes the state decay in the absence of input.</p>

 <div class="equation">\[
        \begin{aligned}
        \tau\frac{\mathrm{d}x_i}{\mathrm{d}t}
          &= -x_i + \sum_j J_{ij}r_j + b + \eta_i(t) + u_i(t), \\
        r_i &= \phi(x_i).
        \end{aligned}
      \]</div>
 <ul>
 <li><strong>Linear rate:</strong> \(\phi(x) = x\). This model is useful for examining propagation, feedback, and responses to small perturbations.</li>
 <li><strong>Tanh rate:</strong> \(\phi(x) = \tanh(x)\), with output between \(-1\) and \(1\). Negative values represent activity below a reference level.</li>
 <li><strong>Sigmoid rate:</strong> \(\phi(x) = \frac{1}{1 + \exp(-x)}\), with output between \(0\) and \(1\).</li>
 </ul>

 <p>The latter two models have saturating outputs; their internal state \(x\) is not clipped. Traces show \(r\), whereas the initial-state standard deviation sets the spread of the Gaussian distribution of \(x\) around zero. For example, in the Sigmoid rate model, \(x = 0\) gives \(r = 0.5\).</p>

 <p>The variables \(x\), \(r\), \(J\), \(b\), \(\eta\), and \(u\) are dimensionless; the rate is not calibrated in \(\mathrm{Hz}\). Time and \(\tau\) are measured in \(\mathrm{ms}\). The parameter \(\tau\) controls how quickly the internal state relaxes and is not directly interchangeable with the LIF membrane time constant.</p>

 <p>Linear rate stability is determined by the eigenvalues of \(J\): all unforced perturbations decay asymptotically only when every eigenvalue has a real part below 1. In nonlinear models, local stability also depends on \(\phi'\) at the current state. The same global gain can therefore have different stability implications across topologies. An irregular trajectory alone does not establish chaos.</p>

 <h4>Conductance-based LIF</h4>

 <p>The conductance-based leaky integrate-and-fire model, or LIF, evolves the membrane potential \(V\). The membrane capacitance stores charge, while leak, excitatory, and inhibitory conductances pull the voltage toward their respective reversal potentials: \(E_{\mathrm{L}}\), \(E_{\mathrm{E}}\), and \(E_{\mathrm{I}}\).</p>

 <p>When the voltage reaches threshold, the model records a spike, resets the voltage, and holds it at the reset value during the refractory period. A spike is an event here; the model does not reproduce the full action-potential waveform.</p>

 <div class="equation">\[
        C_{\mathrm{m}}\frac{\mathrm{d}V_i}{\mathrm{d}t}
          = g_{\mathrm{L}}(E_{\mathrm{L}} - V_i)
          + g_{\mathrm{E},i}(E_{\mathrm{E}} - V_i)
          + g_{\mathrm{I},i}(E_{\mathrm{I}} - V_i)
          + b + \eta_i(t) + u_i(t) - a_i.
      \]</div>

 <p>The membrane potential \(V\), reversal potentials, reset voltage, and threshold are measured in \(\mathrm{mV}\); membrane capacitance \(C_{\mathrm{m}}\) is in \(\mathrm{pF}\), and conductance is in \(\mathrm{nS}\). The background drive, stimulus, and adaptation current \(a\) are in \(\mathrm{pA}\). With time in \(\mathrm{ms}\), both sides of the equation have consistent units.</p>

 <p>Without synaptic input, the membrane time constant is \(C_{\mathrm{m}} / g_{\mathrm{L}}\). For example, \(200\,\mathrm{pF}\) and \(10\,\mathrm{nS}\) give \(20\,\mathrm{ms}\). Increasing conductance changes the voltage toward which the membrane relaxes and shortens the effective time constant.</p>

 <p>After a presynaptic spike arrives with the specified delay, a positive edge increases excitatory conductance by \(J_{ij}\,\mathrm{nS}\); a negative edge increases inhibitory conductance by \(\lvert J_{ij}\rvert\,\mathrm{nS}\). Both conductances decay exponentially with their respective time constants. The direction of the inhibitory current depends on the difference between \(V\) and \(E_{\mathrm{I}}\), so a negative edge does not represent a fixed negative current.</p>

 <p>Each spike can also add a specified increment to the adaptation current, which then decays with the adaptation time constant. Setting the increment to zero disables this feedback.</p>

 <p>The distinction between state and rate is adapted from pages 1–3 of Quan Wen's <cite>Attractor Dynamics and Recurrent Networks</cite>. The meaning of a time constant depends on which dynamical variable is retained; the equations and units above describe this implementation. Standard definitions of LIF neurons and conductance-based synapses are given in <a href="https://neuronaldynamics.epfl.ch/online/Ch1.S3.html" target="_blank" rel="noopener noreferrer">Neuronal Dynamics §1.3</a> and <a href="https://neuronaldynamics.epfl.ch/online/Ch3.S1.html" target="_blank" rel="noopener noreferrer">§3.1</a>.</p>
 </section>

 <section aria-labelledby="theory-connectivity">
 <h3 id="theory-connectivity">Connection direction and topology</h3>

 <p>In the connectivity matrix \(J\), <strong>rows identify postsynaptic neurons and columns identify presynaptic neurons</strong>: \(J_{ij}\) represents \(j \to i\). The global gain multiplies every edge after network generation, including custom weights. Rate models allow negative gain. LIF requires nonnegative gain and uses each edge's sign to distinguish excitatory from inhibitory conductance.</p>

 <ul>
 <li><strong>Directed ring / Feedforward chain:</strong> Neurons are connected in index order, \(1 \to 2 \to \cdots \to N\). The ring also includes \(N \to 1\), providing a return path. Each edge has a base weight of 1; relative jitter \(\delta\) multiplies it by a factor drawn uniformly from \([1 - \delta,\,1 + \delta]\).</li>
 <li><strong>Random:</strong> Each off-diagonal edge is present with probability \(p\). Present edges have zero-mean Gaussian weights with standard deviation \(\frac{1}{\sqrt{\max(1, pN)}}\). The two directions are generated independently: reciprocity is not enforced, and a neuron's outgoing weights need not share a sign.</li>
 <li><strong>E/I:</strong> The first \(\lfloor fN \rfloor\) neurons are \(\mathrm{E}\), and the remainder are \(\mathrm{I}\); \(f\) is the excitatory neuron fraction. The presynaptic type determines the signs of outgoing edges. The base magnitude of an \(\mathrm{I}\) edge is the I/E weight ratio times that of an \(\mathrm{E}\) edge. The Random topology's scale factor and optional relative jitter are then applied. Neither the neuron fraction nor the weight ratio directly specifies the balance of actual excitatory and inhibitory currents.</li>
 <li><strong>Clustered:</strong> Neurons are divided into approximately equal-sized clusters in index order. Base weights within a cluster are positive. Between-cluster weights are additionally multiplied by the between/within weight ratio: zero removes those connections, and negative values make them negative. Off-diagonal edges are included with probability \(p\); weights are divided by \(\max(1, pN / \text{cluster count})\) and may include relative jitter.</li>
 <li><strong>Low-rank:</strong> The structured term sums the outer products of \(k\) random \(\pm 1\) vectors, dividing each term by \(N\) and retaining diagonal entries. It is symmetric and has rank at most \(k\); the number of terms does not guarantee linearly independent vectors. A sparse Gaussian background is added off the diagonal. Background strength and connection probability affect only that background, whereas global gain scales both components.</li>
 <li><strong>Custom:</strong> Each edge-list row contains “source, target, weight.” A full matrix uses targets as rows and sources as columns. Unspecified edges are zero, and self-connections are allowed. Custom and Random networks do not automatically obey the neuron-type constraints of the E/I generator.</li>
 </ul>

 <p>The same generation method, parameters, and network seed produce the same network. After changing size, connection probability, or topology, retaining the seed does not guarantee an edge-by-edge correspondence. Neuron positions in the graph serve only as a layout; they do not represent anatomical coordinates or physical distances.</p>
 </section>

 <section aria-labelledby="theory-input">
 <h3 id="theory-input">OU input and paired stimulation</h3>

 <p>The background drive \(b\) is a constant applied to all neurons. Background noise \(\eta\) follows an Ornstein–Uhlenbeck process, abbreviated OU. The parameter \(\sigma\) sets the stationary standard deviation of each neuron's input, \(\tau_\eta\) sets its correlation time, and \(c\) is the fraction of noise variance contributed by the shared component.</p>

 <p>The shared component \(z_0\) and neuron-specific components \(z_i\) are mutually independent, each with unit stationary variance:</p>

 <div class="equation">\[
        \begin{gathered}
        \eta_i(t) = \sigma\bigl[\sqrt{c}\,z_0(t) + \sqrt{1-c}\,z_i(t)\bigr], \\
        \operatorname{Cov}\bigl[\eta_i(t),\eta_j(t+s)\bigr]
          = \sigma^2\bigl[c + (1-c)\delta_{ij}\bigr]
            \exp\!\left(-\frac{|s|}{\tau_\eta}\right).
        \end{gathered}
      \]</div>

 <p>At \(c = 0\), the neurons' background inputs are independent; at \(c = 1\), the fluctuations are fully shared. This parameter controls input correlation. Correlations in network activity also depend on the recurrent circuit and its nonlinearities.</p>

 <p>Increasing the correlation time makes the input vary more slowly while preserving its stationary standard deviation. This does not hold white-noise intensity fixed, and \(\sigma\) cannot be used directly as the diffusion coefficient of a white-noise model.</p>

 <p>The stimulus \(u\) is applied only to selected neurons. Pulse maintains its amplitude over the specified interval; Step continues until recording ends. The Paired pulse interval is measured between pulse onsets. If it is shorter than the pulse width, the inputs add where they overlap.</p>

 <p>Sine starts at zero phase within the specified interval, with frequency in \(\mathrm{Hz}\) and amplitude specifying the positive and negative peaks. Each row of a Custom sequence gives an onset, duration, amplitude, and targets; overlapping events add.</p>

 <p>Stimulus onsets are measured from \(0\,\mathrm{ms}\) of the recording period; no stimulus is applied during warm-up. Turning the stimulus off sets only \(u = 0\); the background drive and noise remain. Rate-model inputs are dimensionless, whereas LIF inputs are in \(\mathrm{pA}\). These waveforms enter the model equation directly, without a separate model of a stimulator or receptor.</p>

 <p><strong>Paired</strong> comparisons hold the network, initial state, and background input fixed, adding \(u\) only in the stimulus condition. The two trajectories are therefore identical before stimulation. Their subsequent difference includes both the direct response and its propagation through the network. <strong>Independent</strong> comparisons still use the same network but draw separate initial states and background inputs.</p>

 <p>Baseline is a full run of the same network without the stimulus, retaining bias, noise and internal dynamics. It can therefore fluctuate throughout the run. It is distinct from a mean estimated over a prestimulus interval.</p>

 <p>A Paired difference measures the trajectory change induced by stimulation under one fixed background realization. Common additive noise cancels in a linear model; in nonlinear models, the difference also includes state-dependent trajectory separation and is not a background-free stimulus component. An Independent difference additionally contains variation between initial states and noise realizations. Estimating a mean effect and its uncertainty requires repeated trials.</p>

 <p>In LIF, pointwise voltage differences also reflect spike timing and resets; binned-rate differences describe a different statistic. Stimulation can itself alter spontaneous fluctuations; see <a href="https://doi.org/10.1103/PhysRevE.82.011903" target="_blank" rel="noopener noreferrer">Rajan, Abbott and Sompolinsky (2010)</a>.</p>
 </section>

 <section aria-labelledby="theory-numerics">
 <h3 id="theory-numerics">Numerical integration and spike timing</h3>

 <p>The integration step controls how the state advances; the sampling interval controls how often continuous variables are saved. Denser recording cannot correct an integration step that is too coarse. Warm-up runs the same model before recording to let initial-state effects decay, but whether the process has reached stationarity must still be checked.</p>

 <p>Rate models use RK4, the fourth-order Runge–Kutta method. Pulse and Step switch on the integration grid; Sine is evaluated at the midpoint of each step and held constant throughout that step. OU grid values are updated using the exact Gaussian transition, with the left-endpoint input held during integration. Neither the exact OU transition nor RK4 implies fourth-order accuracy for the complete system with noise.</p>

 <p>For LIF, each step first receives arriving spikes and then computes the exponential decay of conductances and adaptation currents. The membrane potential uses an exponential update in which these variables are approximated by their midpoint values. The threshold is checked at the end of the step; if reached, a spike is recorded and the voltage is reset.</p>

 <p>A synaptic event reaches its target after the specified delay, measured from the recorded spike time. Zero delay takes effect at the start of the next integration interval. During the refractory period, the membrane potential remains at the reset value, while conductances, adaptation currents, and inputs continue to evolve.</p>

 <p>Spike times lie on the integration grid. Threshold crossings within a step are not interpolated, and each neuron can emit at most one spike per step. Short latencies, high firing rates, and synchrony should be checked again with a smaller integration step.</p>

 <p>Changing the integration step also changes how the random numbers are consumed. The same seed does not preserve exactly the same continuous noise path, so pointwise differences between trajectories cannot be attributed entirely to integration error.</p>
 </section>

 <section aria-labelledby="theory-recording">
 <h3 id="theory-recording">Recording: neuron subsets and projected channels</h3>

 <p>The simulation always evolves the full network. Neurons that are not individually recorded still influence observations through recurrent connections. The Readout control determines how \(m\) channels are obtained from this activity. Let \(z(t)\) denote the full-network activity vector used by the current statistic, \(N\) the neuron count, and \(R\in\mathbb{R}^{m\times N}\) a fixed readout matrix:</p>

 <div class="equation">\[
        \begin{aligned}
        y(t) &= Rz(t), \\
        C_y &= RC_zR^T.
        \end{aligned}
      \]</div>
 <p>When selecting neurons, each row of \(R\) retains one original coordinate, so the readout covariance is a principal submatrix of the full covariance. Projection instead mixes neurons into channels. With identical samples, centering and normalization, the covariance identity holds exactly for finite data too. Both readouts act on trajectories generated by the full network, retaining recurrent influences from hidden neurons.</p>

 <ul>
 <li><strong>Random subsampling:</strong> Random spatial subsampling selects \(m\) distinct neurons uniformly without replacement and retains their original values. This is the recording procedure studied in §3.7 of the Hu–Sompolinsky paper.</li>
 <li><strong>Random orthogonal projection:</strong> Abbreviated to Random orth. projection in the interface, this reads \(m\) directions from a Haar-distributed orthogonal basis, satisfying \(RR^T=I_m\). Each channel is a signed mixture of activities rather than an individual neuron. There is no additional \(\sqrt{N/m}\) gain: a full covariance of \(I_N\) gives exactly \(I_m\). At \(m=N\), only the orthogonal coordinates change; all covariance eigenvalues and the participation ratio are preserved.</li>
 <li><strong>i.i.d. Gaussian projection:</strong> Every weight is drawn independently as \(R_{ai}\sim\mathcal{N}(0,1/N)\). Here i.i.d. means independent and identically distributed; \(1/N\) is the variance, so the standard deviation is \(1/\sqrt N\). The rows are not subsequently normalized or orthogonalized. They are approximately orthonormal only for large \(N\) and \(m/N\ll1\). At a fixed nonzero fraction \(m/N\), the two projection spectra generally differ. Gaussian projection can change the eigenvalues even at \(m=N\).</li>
 </ul>

 <p><strong>Manual subset, First neurons, Evenly spaced subset, and Within-group subset</strong> are additional coordinate-selection rules provided by this sandbox; the paper does not introduce these as separate sampling methods. Even spacing in index is not necessarily even spacing in physical space. Within-group subset takes the first \(m\) available members of the specified group by index. Recording location can matter in clustered or ring networks and under localized stimulation; recording one cluster does not represent the whole-network mean.</p>

 <p>The paper's spectral equivalence between random neuron selection and random orthogonal projection depends on rotational invariance of the random ensemble and the corresponding large-network conditions. It does not equate the realized eigenvalues of two readouts from one finite network. Gaussian projection is a separate variant discussed in the supplement, with its own approximation regime. Applying these readouts to other topologies and nonlinear models here lets us compare the effect of observation directly; the displayed results are computed from simulated data. See <a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">Hu and Sompolinsky (2022), §3.7, pp. 14–15</a>, and <a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text, §I, cases (i)–(iii), Eqs. (S101)–(S102), pp. 30–31</a>.</p>

 <p>Readout seed is independent of the network and noise seeds, and controls only the random subset or projection weights. The same fixed \(R\) is used for Baseline, Stimulus and Difference. After a simulation completes, changing Recording can read the existing data without integrating the dynamics again. Export readout matrix saves the exact \(R\) used, so the composition of each channel can be inspected.</p>

 <ul>
 <li><strong>Traces:</strong> For neuron subsets, rate models show \(r\) and LIF shows membrane potential \(V\); projection shows their linear mixtures. A projected voltage has no threshold or reset of its own. Coarse recording may miss a real neuron's voltage rise before a spike, and a reset trajectory does not replace the spike-event record. Show stimulus displays only the commanded input \(u\), or the channel's \(Ru\) under projection, excluding background input.</li>
 <li><strong>Raster:</strong> Rate models display activity as a heatmap. LIF neuron subsets use the actual spike raster, with temporal resolution set by the integration step. Projection uses a continuous-activity heatmap, including mixed voltages for LIF, without manufacturing spike events for channels.</li>
 <li><strong>Population:</strong> Rate models take the instantaneous mean over the selected neurons or projected channels; positive and negative values can cancel. LIF first counts spikes in complete, non-overlapping windows and divides by the window duration in seconds. Neuron subsets average over the recorded neurons; projection mixes the neuronal window rates and then averages over channels. Mean projected rate is a channel mean: it depends on the chosen directions, can be negative, and is not the mean firing rate of a biological neuronal population. Windowed points are placed at window centers.</li>
 <li><strong>Connectivity:</strong> The directed graph and matrix always display the original network's \(J\). Nodes, including its full-screen data table under projection, shows the actual neurons' model states; mixed channels do not correspond to individual nodes. Covariance also reflects indirect paths, inputs and sampling, so it cannot be interpreted as a connectivity matrix.</li>
 </ul>

 <p>This approach to comparing mechanisms is adapted from the spring course assignment <cite>Homework 2: Neural Population Dynamics, jPCA, and RNN Models of Motor Cortex</cite>. The sandbox adopts its use of controlled comparisons to study dynamics; the assignment's jPCA analysis and task training are separate procedures.</p>
 </section>

 <section aria-labelledby="theory-covariance">
 <h3 id="theory-covariance">What counts as a covariance sample?</h3>

 <p>The selected interval provides \(M\) samples, each a vector containing \(m\) readout channels. A channel directly corresponds to a neuron only when selecting a neuronal subset. The program subtracts each channel's mean across these \(M\) samples, then computes sample covariance with denominator \(M-1\). Diagonal entries are channel variances, and off-diagonal entries describe joint fluctuations. Values are not normalized by each channel's standard deviation, so this is a covariance matrix rather than a correlation matrix.</p>

 <p>The derivation in S1 Text §H uses \(XX^T/M\) for samples with a known zero mean, without subtracting the sample mean. Main-text Eq. (37) uses sample centering and denominator \(M-1\) for actual data, as this program does. These are distinct estimators at finite \(M\).</p>

 <ul>
 <li><strong>Equal-time:</strong> Each saved time supplies one vector. Rate models use \(r\), and LIF uses \(V\); projection uses the corresponding \(Rr\) or \(RV\). Samples at both ends of the selected interval are included.</li>
 <li><strong>Window mean:</strong> Each non-overlapping window supplies one mean vector. Continuous variables are averaged over the recorded left-endpoint samples within the window. Any incomplete window at the end is discarded. Fixed linear projection and window averaging commute.</li>
 <li><strong>Integrated:</strong> Window mean covariance is multiplied by the window duration in seconds, giving an estimate of finite-window integrated covariance.</li>
 <li><strong>Binned rate:</strong> Available only for LIF. Each neuron's spike count in a complete window is divided by its duration in seconds, giving a rate in \(\mathrm{Hz}\). The current Readout then selects or mixes these rates. Projected signed rates can be negative and are not the firing rates of new neurons. Each window includes spikes at its right boundary and excludes those at its left boundary. This statistic differs from membrane-potential covariance.</li>
 </ul>

 <p>For stationary activity \(y(t)\) with its ensemble mean removed, let \(K(s)\) denote the covariance at lag \(s\), and let \(T\) be the window width in seconds:</p>

 <div class="equation">\[
        \begin{aligned}
        \bar y_T &= \frac{1}{T}\int_0^T y(t)\,\mathrm{d}t, \\
        C_T &= T\operatorname{Cov}(\bar y_T)
             = \int_{-T}^{T}\left(1-\frac{|s|}{T}\right)K(s)\,\mathrm{d}s.
        \end{aligned}
      \]</div>

 <p>For short windows, the population covariance of the window mean approaches the equal-time value \(K(0)\). If the process is stationary and its lagged covariance is integrable, \(C_T\) approaches the integral over all lags in the long-window limit: the power spectrum matrix at zero frequency under this Fourier convention. A finite window retains the triangular weighting, so its result depends on window width.</p>

 <p>The program converts \(\mathrm{ms}\) to seconds before multiplying. For membrane potential, Equal-time and Window mean have units of \(\mathrm{mV}^2\); Integrated has units of \(\mathrm{mV}^2\!\cdot\!\mathrm{s}\); and Binned rate has units of \(\mathrm{Hz}^2\). Rate covariances are dimensionless, with an additional factor of seconds for Integrated. The weights in \(R\) are dimensionless, so projection preserves these units.</p>

 <p>The paper mainly studies long-window integrated covariance, also called zero-frequency covariance, rather than equal-time covariance. Its Eq. (37) divides spike-count covariance by window duration \(T\), equivalently multiplying rate covariance by \(T\). Binned rate covariance here does not include that multiplication, so its normalization differs. The Integrated estimate varies with window width; its long-window convergence conditions are given by the lagged-covariance integral above. See <a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">main text §2.1, Eq. (2), p. 3, and §5.6, Eq. (37), p. 24</a>.</p>

 <p>“Stimulus − baseline” first subtracts the trajectories point by point and then computes the covariance of the difference. This is <strong>not the difference between the two covariance matrices</strong>, because it also involves the trajectories' cross-covariance.</p>

 <p>An interval containing stimulus onset, stimulus offset, or substantial drift also includes the time-varying mean response in its covariance. The covariance then contains both the changing response and fluctuations. Studying stationary spontaneous fluctuations requires an interval consistent with stationarity.</p>

 <p>The discussion of equal-time statistics and window normalization is adapted from sections 1 and 5 of the local note <cite title="随机循环网络协方差谱：理论推导与适用范围">Covariance spectra in random recurrent networks: derivations and scope</cite>; the original research is <a href="https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">Hu and Sompolinsky (2022)</a>. This program estimates statistics from finite-duration trajectories with colored input. Comparisons with white-noise theory require checking its input assumptions against the selected model.</p>
 </section>

 <section aria-labelledby="theory-spectrum">
 <h3 id="theory-spectrum">Eigenspectrum and participation ratio</h3>

 <p>A covariance eigenvalue \(\lambda\) gives the activity variance along a corresponding orthogonal direction. The eigenspectrum orders these values but does not retain the directions' composition in neuron coordinates. A large eigenvalue indicates that one direction carries substantial fluctuations; it does not by itself identify a connection, neuron type, or mechanism.</p>

 <div class="equation">\[
        D = \frac{\left(\sum_k \lambda_k\right)^2}{\sum_k \lambda_k^2}.
      \]</div>

 <p>The participation ratio \(D\) measures how broadly variance is distributed across directions. If only one direction has nonzero variance, \(D = 1\). If \(k\) directions have equal variance and the rest have none, \(D = k\). It need not be an integer and is distinct from the number of PCs retained at a chosen cumulative-variance threshold. When total variance is zero, the ratio is undefined and the interface shows no value.</p>

 <p>The definition and interpretation of participation ratio follow page 21 of Quan Wen's <cite>Geometry of Population Neural Activity and Analysis Methods</cite>.</p>

 <p>With \(m\) readout channels, \(D\) cannot exceed \(m\). After subtracting the sample mean from \(M\) samples, covariance rank is at most \(\min(m,M-1)\). With few samples, zero eigenvalues may arise solely from this rank bound.</p>

 <p><strong>Spatial sampling</strong> specifies which neurons or activity directions are observed; <strong>temporal sampling</strong> specifies how many vectors are available to estimate covariance. Let the readout fraction be \(f=m/N\). The paper defines \(\alpha=N/M\) for the full network; after readout, the corresponding temporal ratio is \(m/M=f\alpha\). For Equal-time, \(M\) counts saved vectors; for window estimators, it counts complete windows. It is not automatically the integration-step count. Recording all neurons does not remove finite-time sampling uncertainty.</p>

 <p>The paper's temporal-sampling derivation assumes independent Gaussian sample columns. In a trajectory, adjacent time points and even adjacent non-overlapping windows can remain temporally correlated. Having \(M\) observations does not establish \(M\) independent repetitions, and denominator \(M-1\) does not remove those correlations. Saving more densely does not add independent information at the same rate. See <a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">main text §3.7, Eqs. (22)–(23), p. 14</a>, and <a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text, §H, pp. 26–29, and §I.2, Eq. (S107), p. 32</a>.</p>

 <p>For a fixed recording duration, wider windows both reduce the sample count and change the population covariance being estimated. Both effects influence the eigenspectrum and \(D\). Compare the Readout, channel count, sample count, time interval, window width and statistic together.</p>

 <p>Absolute dimension \(D\) and relative dimension \(D/m\) can change in opposite directions. In the paper's random spatial-compression limit, \(D\) decreases while \(D/m\) increases. This is not a theorem for every finite network and every selected subset, and does not imply recovery of unobserved information. See <a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text, §I.1, Eqs. (S104)–(S105), pp. 31–32</a>. Three channels provide at most three eigenvalues, which cannot establish the tail exponent of a large-network spectral density.</p>

 <p>Shared fluctuations may originate in recurrent coupling or in shared input. A single covariance matrix cannot uniquely determine the full connectivity. This discussion is adapted from the local note <cite title="少量神经元能留下哪些谱信息">What spectral information survives when only a few neurons are recorded?</cite>. The page computes its numerical results from the current configuration; the note's separate experiments provide interpretive context.</p>
 </section>

 <section aria-labelledby="theory-sources">
 <h3 id="theory-sources">Presets and references</h3>

 <p>Presets provide editable instances of the model families below. Each entry describes the correspondence; comparisons with a paper's figures, phase diagrams or critical values require matching its parameters, network size and input conditions.</p>

 <ul>
 <li><a href="https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.61.259" target="_blank" rel="noopener noreferrer">Sompolinsky, Crisanti, and Sommers (1988)</a>: random rate networks and chaos. Networks here are finite, can be sparse, and can receive stimuli and colored input. Similar equations do not guarantee that the current parameters lie in the paper's chaotic phase.</li>
 <li><a href="https://arxiv.org/abs/1711.09672" target="_blank" rel="noopener noreferrer">Mastrogiuseppe and Ostojic (2018)</a>: low-rank connectivity and dynamics. This program uses outer products with the same sign vector on both sides, a special symmetric construction. It does not implement the general geometry of distinct left and right vectors or the paper's computational tasks.</li>
 <li><a href="https://link.springer.com/article/10.1023/A:1008925309027" target="_blank" rel="noopener noreferrer">Brunel (2000)</a>: sparse E/I spiking networks. This program uses conductance-based synapses, an OU background, and optional adaptation, so its model conditions differ from those in the paper.</li>
 <li><a href="https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer">Hu and Sompolinsky (2022)</a>: covariance eigenspectra and finite sampling in linear recurrent networks. This program computes finite-window statistics from trajectories to compare readout methods, analysis windows and channel counts.</li>
 </ul>

 <p>The ring, chain, clustered, and single-neuron adaptation configurations are constructed from this program's equations and do not correspond to any one paper's complete model. Passages marked as adaptations come from local course or project materials; the remaining explanations describe this implementation. The spring course materials originate from the <a href="https://github.com/Wenlab/Computation-Neuro-Course/blob/Spring-2026/README.md" target="_blank" rel="noopener noreferrer">Wenlab Computational Neuroscience Course</a>.</p>
 </section>
`
  };
})();
