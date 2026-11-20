# 神经网络沙盒

沙盒在同一张有向网络上比较 Baseline 与 Stimulus，可调整 neuron dynamics、connectivity、输入和读出方式，并查看活动、协方差与 eigenspectrum。

## 下载后直接使用

**[下载完整离线包](https://github.com/LuckytoeUSTC/neural-network-sandbox/releases/latest/download/neural-network-sandbox-offline.zip)** · [全部版本](https://github.com/LuckytoeUSTC/neural-network-sandbox/releases)

解压整个文件夹 → 用 **Chrome 或 Edge** 打开 **`index.html`**。不需要 Python、Node.js、账号、服务器或网络。不要在 ZIP 预览中打开，也不要单独移动 HTML。MathJax 的脚本、字体、扩展和许可证已包含在包内。

**Download the offline ZIP, extract the whole folder, and open `index.html` in Chrome or Edge. No installation or internet connection is required.** The interface is in English; Models & methods includes Chinese and English explanations.

GitHub 的 Code → Download ZIP 是开发源码；直接使用请选择上面的离线包。计算与导出都在浏览器本地完成，没有远端计算服务。请导出需要保留的配置和数据；刷新或关闭页面会清除当前会话与 Reference。


模拟、读出投影、Covariance 和 eigenspectrum 在 Web Worker 中计算。计算时已有图表仍可操作；点击 Stop 停止当前运行，并保留上一次完成的结果。程序使用 JavaScript / Float64。Worker 保留轨迹供后续分析，代价是线程启动、数据复制和额外内存占用。


## 运行一次实验

1. 选一个 Preset，或从 Model、Network 和 Stimulus 分别配置。每个 Preset 会立即运行一次。更改动力学、连接或输入后，点击 Run current settings 更新结果。
2. 在 Recording 中选择 Readout，再指定 neuron 数量、编号或 readout channel 数。可以记录单个节点、全网（上限 96 个节点），也可以选择 Random orth. projection 或 i.i.d. Gaussian projection。成功运行后改变读出会在 Worker 中重读已有模拟，保持原网络与轨迹。
3. 用 Traces 比较 Baseline 和 Stimulus，用 Raster 看 recorded activity 或 spike events，用 Population 看均值和分组活动。在 Connectivity 中选节点、查看 incoming / outgoing edges，或在 Nodes 图内切换活动模式并播放。
4. 在 Covariance 中选择 时间范围、Estimator 和 Window。这里有 Equal-time、Window mean、按 window duration 缩放的 Integrated estimate，以及 LIF 的 Binned rate covariance。
5. 导出配置复跑，或导出数据在 Python、Julia 等环境分析。网络、输入噪声、观测子集各有独立种子，方便固定其他变量只重抽其中一个。

按钮用蓝色表示待计算、绿色表示完成、红色表示失败；运行中绿色进度覆盖蓝底，点击 Stop 停止。停止后保留进度，Run again 从头重算。按钮下的人数与记录数对应当前已完成的结果；错误与无法执行的原因另行显示。

## 可编辑的构件

| 构件 | 选项 |
| --- | --- |
| 状态方程 | 线性率、tanh 率、logistic 率、电导型 LIF。LIF 可设置重置、阈值、电容、漏电导、突触时间常数、延迟、不应期和放电适应。 |
| 连接 | 有向环、前馈链、稀疏随机、E/I、分簇、低秩结构加随机背景，或输入完整矩阵／边列表。 |
| 驱动 | 常量与有色 OU 波动，可设噪声相关时间及公共成分。基线和刺激支持配对、独立重抽两种对照。 |
| 刺激 | 单脉冲、双脉冲、阶跃、正弦或自定义多段事件，可独立指定各段目标和幅度。 |
| 记录与分析 | 随机空间子采样、Haar 随机正交投影、i.i.d. Gaussian 投影；另可指定编号、按编号均匀选取或指定组。可单独设定统计区间和窗长。 |

自定义边列表每行是 `来源,目标,权重`，完整矩阵按 `行=目标，列=来源`。把导出的权重矩阵粘贴进完整矩阵编辑器后，将Gain设为 1，即可使用已经缩放好的矩阵。刺激序列每行是 `开始（ms）,持续（ms）,幅度,目标编号`。编号从 1 开始，可用 `1 4-7` 或 `全部`。

## 阅读图表与操作控件

Traces 显示记录的活动，方波图标控制同图中的 stimulus input，初始默认开启。粗实线 input 使用独立、固定的全记录尺度；它的幅度和单位在 Input 列中读取。曲线按积分网格绘制，合并数据表按记录时刻取值。切换 input 可见性保持图框和表格尺寸。

Baseline 保留无刺激时的内部活动、bias 和 noise。Paired 比较固定初态与噪声；Independent 分别抽取两次随机实现。Difference 是同次实验内 Stimulus − Baseline。非线性网络的差值包含状态依赖的轨迹分离；Independent 的差值还包含随机背景差异。平均效应及不确定性需要重复实验。初始活动视图有刺激时显示 Stimulus，无刺激时显示 Baseline；Covariance 初始显示 Baseline。

时间滑条默认锁定。拖动选中段或任一手柄平移固定宽度的区间，纵轴保持全记录尺度。解锁后分别调整两端，松手更新图；两端不能交叉。恢复全长图标在完整区间时亮起。From、To 和 Window 可键入，失焦或 Enter 应用。重跑、Resample 和 Preset 切换保留仍适用的显示偏好、时间范围和节点选择；超出新实验范围时调整。

Covariance 在 eigenvalues 图下列出通道数 m、样本数 M、空间比例 f = m/N、时间采样比例 m/M、Participation ratio 和 Relative PR。M 计数保存向量或完整窗口；时间相关性决定这些样本包含多少独立信息。数值最多显示 3 位有效数字，时间保留定位精度，CSV 保留原始精度。

Connectivity 中的 Nodes 和 Connectivity matrix J 描述同一张网络。Incoming / Outgoing 表默认展开。矩阵的青色实线框标记选中项，橙色虚线框标记悬停项；鼠标离开矩阵后恢复选中项的读数。Nodes 图内可切换 Recording／Structure、Baseline、Stimulus 和 Difference。Play / Pause 与毫秒读数相邻；播放到末尾暂停并回到起点，手动暂停保留位置。

Nodes 全屏保留主标题与 Neuron / Edges 控制，左侧为节点图，右侧为活动表和竖向色标。活动模式提供短时间滑条，拖动时暂停播放。神经元子集列出已记录神经元，投影模式列出全网神经元状态；色点与节点使用相同尺度。Recording／activity 预留相同的控制、读数和色标位置。退出全屏后回到连接表。Compare 的播放控件和读数也保留位置。

桌面宽度达到 1000 px 时，设置与结果采用固定区域。设置区只有参数主体滚动，标题、Preset、Run 和状态固定；Traces 的长数据表、Connectivity 的连接表和说明文档分别在自己的区域滚动。较窄窗口采用普通页面滚动。圆形 i 在悬停时显示相邻浮窗，点击固定，点击外部或 Esc 关闭。Models & methods 中可阅读完整模型说明。

配置导入／导出位于设置框。Tab bar 右侧的 Export data 导出当前读出数据；Export connectivity 位于 Connectivity 页；Export readout matrix 位于 Recording；Export covariance 位于 Covariance 页。

## 比对两次完成的实验

1. 完成一次运行后，在 Traces 或 Connectivity 首行点击钉子 **Pin current view**，复制已完成的数据、配置与 recording selection，并带入当前显示模式、选点和时间范围。页面保留当前 Tab；对应钉子变为 **Unpin reference**。
2. 改参数或切换 Preset，再运行。Reference 保持不变，Current 更新为新完成的结果；计算中禁用 Pin，取消或失败时保留上一次完整结果。
3. Compare 保留 View 选择框；切换 View 后，对应的源 Tab 显示 Unpin，另一个显示 Pin。点击另一个 Tab 的 Pin 会替换 Reference。Compare 的 Connectivity 显示节点图，可选择 Recording、Baseline、Stimulus 或 Difference；活动模式提供播放／暂停和毫秒读数，没有滑条。Traces 提供 Baseline、Stimulus、Difference 和 Baseline + Stimulus；两侧独立输入 neuron ID 或投影 channel ID，如 `1-4, 7` 或 `all`，默认显示前 8 个读出通道。主 Traces 使用相同的编号输入。
4. 同单位的 Traces 共用 value axis，时间轴始终共用。节点活动在两次实验共有的时长内同步播放，各自读取最接近当前时间的记录样本；同单位共享固定 color scale，不同单位使用各自色阶。Difference 均指各次实验内部的 Stimulus − Baseline，不是 Current − Reference。
5. 再点钉子 **Unpin reference** 清除固定结果，需要固定新的结果时重新 Pin。Compare 也使用同一个 Unpin 图标，不重复设置 Clear reference 按钮。**Export reference config** 导出固定实验的版本 2 配置，可用 Import config 重跑。

固定结果保留在当前页面会话内，刷新页面会清除。图表操作读取已完成的数据。

## 快捷键

- `Shift + Enter`：运行实验；计算中不作为停止快捷键。
- `F5`：更换 Network seed、重新抽样 Connectivity 并运行；自定义矩阵或零 jitter 的确定性 ring / chain 显示提示，保持其定义。
- `F9`：按当前设置运行实验；正在计算时会中止旧请求并启动新请求。
- `B` / `N`：上一个／下一个 Results tab。
- `Esc`：退出 Nodes 全屏；打开对话框时使用浏览器默认的关闭行为。停止计算使用 Run / Stop 按钮。
- `?`：打开 Shortcuts；也可点击同名按钮。
- `Tab`、`Shift + Tab`、`Enter`、`Space` 保留原生控件导航。刷新整个页面可用浏览器 Reload 命令。

F5 / F9 可从输入控件和图表触发；Shift + Enter 也可从选择框和单行输入框运行，多行文本编辑与输入法组合输入时避让。B/N 在输入控件、图表内避让。全部快捷键在对话框和输入法组合输入期间暂停，也不拦截 Ctrl / Alt / Meta 组合键。B/N 始终启用，不提供开关。

开发入口 `dist/index.html` 使用共享的 `D:\MathJax\local-mathjax.js`；打包时自动转换为包内相对路径，不修改开发源码。`dist/math.js` 负责说明页签和窗口宽度变化后的重新排版。

## 数据与适用范围

- JSON 配置版本为 2，保存模型、连接、刺激、种子及记录选择。早期原型的版本 1 使用不同的动力学及离散更新式，其旧轨迹不能用新版方程重放。
- 投影使用固定的 m×N 矩阵 R：orthogonal 模式满足 RRᵀ = I；Gaussian 模式各元素独立取 N(0, 1/N)，不额外归一化。后者仅在 N 大、m/N 小时近似正交。Readout seed 与动力学种子独立；Export readout matrix 导出确切 R。术语、归一化与 finite sampling 条件依据 [Hu–Sompolinsky (2022)](https://doi.org/10.1371/journal.pcbi.1010327) 及 [S1 Text §§H–I](https://doi.org/10.1371/journal.pcbi.1010327.s001)，
- 投影 Traces、Population、Covariance 和 Compare 使用读出通道，Reference 保存自己的 R。Nodes 始终显示原网络神经元，投影时全屏表列出全网活动。投影模式的 CSV 用 `readout` 和 `projected_count` 命名，只为原神经元保留 spike events；投影电位没有独立阈值，signed rate 可以为负。
- 数据 CSV 的 `u_*` 是该时间点开始的积分区间要施加的命令，未计背景驱动。LIF 的 `*_spike_count_*` 统计上一记录时刻之后、截至当前记录时刻的事件，首行计数为 0。在神经元子集模式下，可从 Raster 导出积分网格上逐个放电事件。
- 小型实验在浏览器中运行，可以停止计算。预设用于探索模型族与条件对照；Models & methods页给出方程、单位、积分近似、统计口径和来源。

## 选材

| 实验内容 | 采用的资料 |
| --- | --- |
| 状态与发放率、群体活动和机制对照 | 温泉秋季课程 *Attractor Dynamics and Recurrent Networks* 第 1–3 页、春季作业 *Neural Population Dynamics, jPCA, and RNN Models of Motor Cortex*。 |
| 随机和低秩率网络 | [Sompolinsky、Crisanti 与 Sommers（1988）](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.61.259)、[Mastrogiuseppe 与 Ostojic（2018）](https://arxiv.org/abs/1711.09672)。 |
| 电导型 LIF 与 E/I 脉冲网络 | [Neuronal Dynamics · Integrate-and-fire](https://neuronaldynamics.epfl.ch/online/Ch1.S3.html)、[Neuronal Dynamics · Synapses](https://neuronaldynamics.epfl.ch/online/Ch3.S1.html)、[Brunel（2000）](https://web.njit.edu/~horacio/AdvancedCompNeuro/downloads/Brunel_JCompNeurosci-2000.pdf)。 |
| 参与维数、部分观测、有限时间窗 | 温泉秋季课程 *Geometry of Population Neural Activity and Analysis Methods* 第 21 页，本地「理论计算_协方差谱」的理论推导和部分观测实验，[Hu 与 Sompolinsky（2022）](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1010327)。 |

## 维护与验证

- `dist/`：当前离线应用；直接维护源码，无构建步骤。`worker.html` 是保留旧链接的微型跳转页。
- `tests/`：当前回归测试；`tools/`：手动性能测量。
- `.test-output/`：测试生成的截图，可随时删除，不作为理论材料保存。

在项目根目录运行。JavaScript 测试需要 Node.js；浏览器测试另需 Playwright，可用 `THREE_NEURONS_CHROME` 指定浏览器，否则优先使用本机 Chrome／Edge，再使用 Playwright 自带浏览器。

| 命令 | 用途 |
| --- | --- |
| `node tests/verify-state-controls.cjs` | Pin／View 联动、显示快照、按钮状态和停止进度、首帧时间边界。 |
| `node tests/verify-ui-stability.cjs` | 模式切换位置、紧凑控件、快捷键、重抽样后的偏好保持和三种宽度。 |
| `node tests/verify-recording-ui.cjs` | 读出更新、Rx／Ru、Worker 统计、精确导出、Reference 隔离和过期响应。 |
| `node tests/verify.cjs` | 预设、连接、输入、随机种子、重放和取消。 |
| `node tests/verify-recording.cjs` | 投影矩阵、RCRᵀ、有限采样边界和 LIF 读出。 |
| `node tests/verify-worker.cjs` | Worker 与同步内核一致性、取消、保留结果、错误恢复和界面响应。 |
| `node tests/verify-math.cjs` | 离线 MathJax、双语文档和不同窗口宽度。 |
| `python tests/verify-reference.py` | 解析解、SciPy DOP853 和 NumPy／LAPACK 的独立数值对照；另需 NumPy、SciPy。 |
| `node tools/benchmark-compute.cjs` | 主线程与 Worker 耗时；含启动和复制，不含绘图。 |

通常只运行受修改影响的测试。性能脚本支持 `NEURO_REFERENCE_MODEL` 指定旧 model.js、`NEURO_BENCHMARK_OUTPUT` 保存结果。历史耗时见下表；2026-11-17 的整理没有重新测量求解速度。节点布局按图尺寸缓存；状态按钮保留 DOM，仅更新实际变化的图标、文字和进度，减少动画和进度显示中的重复工作。

## 本机性能对照（2026-11-15）

Chrome 157，离线运行，同配置交替测量三次，表中为 wall time 中位数。Worker 列包含启动和结果复制；均不包含图表绘制。这些测量对应当时的本机配置；耗时随设备和负载变化。

| 配置 | 修改前主线程 | 优化后主线程 | 后台版 |
| --- | ---: | ---: | ---: |
| Ring，12 neurons，1 s | 17 ms | 17 ms | 58 ms |
| Random rate，48 neurons，1 s | 501 ms | 181 ms | 161 ms |
| E/I LIF，64 neurons，1.3 s | 150 ms | 184 ms | 187 ms |
| Dense tanh，96 neurons，10 s，dt = 0.5 ms | 20.11 s | 6.65 s | 4.85 s |

Dense tanh 的全部轨迹与统计输出逐项一致；后台版模拟期间，16 ms 主线程 heartbeat 的最大间隔为 18.5–21.8 ms。LIF 的计算循环没有这次的 rate-edge 优化，Worker 主要改善其界面响应，不保证更短的求解时间。仍维持 96 neurons、80,000 integration steps、16,000 recording intervals 的原有限制。

Rate model 将连接压成连续数组，减少 RK4 各阶段的边对象解构；当时的优化保持累加顺序、Time step、随机数序列与方程。

## 构建离线包

开发需要 Python 3（仅打包），浏览器测试需要 Node.js 和 Playwright：

```sh
npm install
npx playwright install chromium
python tools/build-release.py --mathjax-root /path/to/MathJax
```

MathJax 目录须包含 `local-mathjax.js` 与 `4.1.3/`（SVG renderer、extensions、fonts 和许可证）。首次准备时可从离线发布包的 `vendor/mathjax/` 取得这份固定版本依赖；Windows 共享安装的默认路径为 `D:/MathJax`。输出为 `release/neural-network-sandbox-offline.zip`，含逐文件 SHA-256 清单。测试开发版时将 MathJax 安装到上述共享路径；发布包验收使用 `node tests/verify-release.cjs`，不依赖 D 盘。

MathJax 与字体许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本仓库不附带课程讲义、论文 PDF、本机配置或开发历史存档。

