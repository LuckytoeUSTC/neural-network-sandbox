(() => {
  "use strict";

  const groups = [
    {
      zh: "实验设置", en: "Experiment setup",
      chapters: [
        { id: "presets", zh: "实验预设", en: "Preset" },
        { id: "models", zh: "神经元模型", en: "Neuron model" },
        { id: "network", zh: "网络", en: "Network" },
        { id: "input", zh: "输入与刺激", en: "Input &amp; stimulus" },
        { id: "numerics", zh: "模拟与时间步长", en: "Simulation" },
        { id: "recording", zh: "记录与投影", en: "Recording" }
      ]
    },
    {
      zh: "结果图", en: "Result views",
      chapters: [
        { id: "traces", zh: "时间轨迹", en: "Traces" },
        { id: "raster", zh: "栅格图与热图", en: "Raster" },
        { id: "population", zh: "群体均值", en: "Population" },
        { id: "covariance", zh: "协方差与特征谱", en: "Covariance" },
        { id: "connectivity", zh: "连接图与矩阵", en: "Connectivity" }
      ]
    },
    {
      zh: "比较与复现", en: "Compare and reproduce",
      chapters: [
        { id: "compare", zh: "实验对照", en: "Compare" },
        { id: "exports", zh: "导出", en: "Exports" },
        { id: "sources", zh: "参考文献", en: "References" }
      ]
    }
  ];

  const copy = {
    zh: {
      presets: String.raw`
<p>选择预设会按其默认参数运行一次实验。每次实验都在同一张网络上计算两种条件。Baseline 只有背景输入，Stimulus 还对指定神经元施加刺激。可在 Traces 中叠放两条轨迹，也可查看逐点差值（Stimulus − Baseline）。</p>
<dl>
  <dt><strong>Ring propagation</strong></dt>
  <dd>12 个线性率神经元首尾相连，1 号接受短脉冲。沿编号查看各条差值曲线的峰值时间，可以追踪活动沿环传播、再回到起点的过程。</dd>
  <dt><strong>Feedforward propagation</strong></dt>
  <dd>12 个线性率神经元连成一条单向链。脉冲从 1 号沿链传递，每一级都按自身的时间常数整合上一级的输入。可比较响应峰沿链推迟、展宽的程度。与环预设相比，这里还改变了增益。单独研究回路的作用时，可把两个实验的 Gain 设为相同值。</dd>
  <dt><strong>Random rate network</strong></dt>
  <dd>48 个 Tanh 神经元通过随机正、负权重连接。固定网络与噪声种子，改变 Gain，可以观察一个局部脉冲如何被反馈放大、衰减或传到其他神经元。</dd>
  <dt><strong>Low-rank network</strong></dt>
  <dd>48 个 Tanh 神经元的连接含有两个秩一结构项和一个随机成分。1–8 号神经元同时受刺激。调整 Random bulk strength，再比较 Covariance 中的特征值，能观察群体波动如何分布到不同活动方向上。</dd>
  <dt><strong>Clustered network</strong></dt>
  <dd>36 个 Sigmoid 神经元分成三个簇，簇内连接为正，默认簇间连接为负。刺激只到达第一簇的 1–5 号。若想在 Population 中比较三簇，先在 Recording 选择 Evenly spaced subset，使记录覆盖各簇，再选 By group。</dd>
  <dt><strong>Partial observation</strong></dt>
  <dd>32 个线性率神经元在有时间相关的噪声下自发活动，默认从 8 秒轨迹中读取随机选取的 12 个神经元。将数量改为 3，或改用投影，能在同一次网络活动上比较读出协方差、特征值与有效维数。</dd>
  <dt><strong>E/I spiking network</strong></dt>
  <dd>64 个电导型 LIF 神经元分成兴奋性与抑制性两群，1–8 号接受一段电流脉冲。Raster 显示单个放电事件，Population 的 By group 可比较两群已记录神经元的平均发放率。</dd>
  <dt><strong>Spike-frequency adaptation</strong></dt>
  <dd>一个无突触输入的 LIF 神经元接受持续的阶跃电流，每次放电都会增加适应电流。在 Raster 中查看相邻放电的间隔，再把 Adaptation increment 从 32 pA 改为 0，比较同一阶跃下放电节律的变化。</dd>
</dl>
`,
      models: String.raw`
<h4>连续率模型</h4>
<p>神经元 \(i\) 的内部状态为 \(x_i\)，它向其他神经元传递的活动为 \(r_i=\phi(x_i)\)。右侧依次包含泄漏、网络输入、恒定背景驱动 \(b\)、背景噪声 \(\eta_i\) 和刺激 \(u_i\)。时间常数 \(\tau\)（ms）决定内部状态响应输入的快慢。</p>
<div class="equation">\[
  \begin{aligned}
  \tau\dot x_i &= -x_i+\sum_j J_{ij}r_j\\
               &\quad+b+\eta_i(t)+u_i(t),\\
  r_i &= \phi(x_i).
  \end{aligned}
\]</div>
<ul>
  <li><strong>Linear rate</strong> 取 \(\phi(x)=x\)。相同背景下，两条轨迹的差满足同一个线性系统，因此可以直接追踪刺激的传播。</li>
  <li><strong>Tanh rate</strong> 取 \(\phi(x)=\tanh x\)。正、负值表示相对零点的双向活动，输出的极限为 \(+1\) 和 \(-1\)。</li>
  <li><strong>Sigmoid rate</strong> 取 \(\phi(x)=1/(1+e^{-x})\)。输出在 0 与 1 之间，\(x=0\) 对应 \(r=0.5\)。</li>
</ul>
<p>三种模型的状态、活动、权重和输入均采用无量纲单位。Initial SD 决定初始 \(x_i\) 围绕零的高斯分布，图中记录的是经 \(\phi\) 转换后的 \(r_i\)。在线性模型中，如果 \(J\) 的所有特征值实部均小于 1，脉冲结束后，受扰轨迹与原轨迹的差最终衰减。对非线性模型，固定点附近的稳定性还取决于各神经元在该处的斜率 \(\phi'(x_i)\)。</p>
<h4>电导型漏积分发放模型（LIF）</h4>
<p>膜电容 \(C_{\mathrm m}\) 储存电荷。漏电导 \(g_{\mathrm L}\)、兴奋性电导 \(g_{\mathrm E,i}\) 和抑制性电导 \(g_{\mathrm I,i}\) 分别把膜电位 \(V_i\) 拉向相应的反转电位 \(E_{\mathrm L},E_{\mathrm E},E_{\mathrm I}\)。适应电流 \(a_i\) 抵消一部分去极化输入。</p>
<div class="equation">\[
  \begin{aligned}
  C_{\mathrm m}\dot V_i &= g_{\mathrm L}(E_{\mathrm L}-V_i)\\
   &\quad+g_{\mathrm E,i}(E_{\mathrm E}-V_i)\\
   &\quad+g_{\mathrm I,i}(E_{\mathrm I}-V_i)\\
   &\quad+b+\eta_i(t)+u_i(t)-a_i.
  \end{aligned}
\]</div>
<p>膜电容以 pF 计，电导以 nS 计，电位以 mV 计，输入与适应电流以 pA 计。Initial SD 给出初始电位围绕漏反转电位的标准差。只有漏电导时，膜时间常数为 \(C_{\mathrm m}/g_{\mathrm L}\)。例如 \(200\,\mathrm{pF}\) 和 \(10\,\mathrm{nS}\) 对应 \(20\,\mathrm{ms}\)。突触电导开放时，总电导增大，电位响应也更快。</p>
<p>膜电位达到 Spike threshold 就记一次放电，膜电位随即回到 Reset potential，并在 Refractory period 内保持该值。放电经过 Synaptic delay 到达下游时，正权重令兴奋性电导增加 \(J_{ij}\)，负权重令抑制性电导增加 \(|J_{ij}|\)。两种电导分别按 E decay time 和 I decay time 指数衰减。每次放电也会让本细胞的 \(a_i\) 增加 Adaptation increment，随后按 Adaptation decay 衰减。把增量设为零即可关闭适应。</p>
`,
      network: String.raw`
<p>Neurons 设定网络大小 \(N\)。矩阵 \(J\) 的列表示发送神经元，行表示接收神经元，\(J_{ij}\) 对应 \(j\to i\)。Gain 在拓扑生成后乘到每条连接上，也作用于自定义矩阵。LIF 和 E/I 要求增益非负，以保留兴奋性、抑制性连接的符号。</p>
<ul>
  <li><strong>Directed ring、Feedforward chain</strong> 依次建立 \(1\to2\to\cdots\to N\)。环再接上 \(N\to1\)。基准权重为 1。Relative weight jitter 为 \(\delta\) 时，每条边独立乘以从 \([1-\delta,1+\delta]\) 均匀抽取的因子。</li>
  <li><strong>Random</strong> 以 Connection probability \(p\) 独立抽取每一条非自连接。存在的边取零均值高斯权重，增益调整前的标准差为 \(s=1/\sqrt{\max(1,pN)}\)。两个方向分别抽取。</li>
  <li><strong>E/I</strong> 按 E fraction \(f_{\mathrm E}\) 将前 \(\lfloor f_{\mathrm E}N\rfloor\) 个神经元设为兴奋性，其余设为抑制性。发送神经元决定出边符号。兴奋性边的基准权重为 \(s\)，抑制性边的绝对值再乘 I/E weight ratio。两类非自连接均按概率 \(p\) 抽取，并可加入相对抖动。</li>
  <li><strong>Clustered</strong> 按编号将神经元分成指定数量 \(K\) 的簇。非自连接以概率 \(p\) 抽取。簇内基准权重为 \(1/\max(1,pN/K)\)，簇间再乘 Between/within weight，随后可加入相对抖动。这个比例为零时各簇断开，为负时簇间作用与簇内相反。</li>
  <li><strong>Low-rank</strong> 对每个秩一项抽取一个分量为 \(\pm1\) 的向量 \(v_k\)，并把 \(v_kv_k^T/N\) 加入结构部分，包括对角元。Rank-one terms 决定项数。结构部分对称，秩至多等于项数。Random bulk strength 缩放额外叠加的稀疏高斯权重，\(p\) 控制随机部分的连边概率。</li>
  <li><strong>Custom</strong> 支持 Edge list 和 Dense matrix 两种输入。边列表每行按发送者、接收者、权重填写。例如 <code>1, 3, -0.6</code> 将 \(3\) 行 \(1\) 列设为 \(-0.6\)，未列出的连接取零。完整矩阵每行依次填写一个接收者从所有发送者获得的权重。两种格式都允许自连接。</li>
</ul>
<p>固定拓扑和各项生成参数后，Network seed 可以重建同一张网络。Resample network（F5）为含随机成分的网络更换种子并重新运行。较大的网络可从稀疏拓扑开始。在相同规模下，连接越多，每步需要累加的突触输入也越多。</p>
`,
      input: String.raw`
<h4>背景驱动与噪声</h4>
<p>Background drive 是每个神经元持续接受的常量 \(b\)。Noise SD（\(\sigma\)）给出单个神经元背景噪声的平稳标准差。Noise correlation time（\(\tau_\eta\)）决定噪声在时间上延续多久。在相同 \(\sigma\) 下增大它，波动幅度的标准差相同，但变化更慢。率模型的输入无量纲，LIF 的输入用 pA。</p>
<p>噪声由相互独立、平稳方差为 1 的 Ornstein–Uhlenbeck 过程组成。\(z_0\) 为全网共享成分，每个神经元还有私有成分 \(z_i\)。Shared variance fraction \(c\) 给出共享方差的比例。</p>
<div class="equation">\[
  \begin{aligned}
  \eta_i(t)&=\sigma\bigl(\sqrt{c}\,z_0(t)+\sqrt{1-c}\,z_i(t)\bigr),\\
  \operatorname{Cov}[z_k(t),z_k(t+s)]&=e^{-|s|/\tau_\eta}.
  \end{aligned}
\]</div>
<p>\(c=0\) 时不同神经元的背景噪声独立，\(c=1\) 时完全共享。对 \(\sigma>0\)，两神经元噪声输入的零时滞相关系数就是 \(c\)。它们在图中显示的活动相关性还受到网络反馈及神经元响应函数的影响。</p>
<h4>刺激波形</h4>
<p>Target IDs 可填写编号、范围或 <code>all</code>。Onset 从正式记录的 \(0\,\mathrm{ms}\) 起算，Amplitude 只施加到选定的神经元。</p>
<ul>
  <li><strong>None</strong> 只保留背景驱动和噪声。</li>
  <li><strong>Square pulse</strong> 在 Duration 内维持给定幅度。<strong>Step</strong> 从 Onset 持续到记录结束。</li>
  <li><strong>Paired pulses</strong> 施加两个等宽、等幅的方波。Onset interval 是两个起点之间的间隔，重叠部分的幅度相加。</li>
  <li><strong>Sinusoidal</strong> 在给定时长内施加从零相位开始的正弦波。Frequency 单位为 Hz，Amplitude 是峰值幅度。</li>
  <li><strong>Custom sequence</strong> 每行填写起点（ms）、时长（ms）、幅度和目标。例如 <code>120, 30, 1.8, 1 3</code> 使 1 号和 3 号从 120 ms 开始同时受刺激 30 ms。作用于同一神经元的多段输入可叠加。</li>
</ul>
<h4>两种条件怎样配对</h4>
<p><strong>Paired</strong> 为两种条件使用相同的初态和背景噪声，因而刺激前的轨迹重合。Difference 表示在这次背景下加入刺激所产生的变化。线性率模型的共同加性输入在相减时消去，非线性模型的后续响应还取决于刺激把网络带到了什么状态。</p>
<p><strong>Independent</strong> 保留同一张网络，分别抽取两种条件的初态和背景噪声。此时一次差值中也包含试次间的自然变异。要估计跨试次的平均差值，可保持网络种子并更换 Noise seed，重复整对实验。Resample noise（F9）同时重抽初态与噪声。</p>
`,
      numerics: String.raw`
<p>Duration 是正式记录时长。Warm-up 先在只有背景输入的条件下演化一段时间，随后将记录时钟置零。较长的预热给初态影响更多衰减时间。分析自发波动时，可从轨迹判断所选记录段的均值和起伏幅度是否趋稳。</p>
<p>Time step（\(\Delta t\)）决定方程的积分步长，Sample interval（\(\Delta_s\)）决定连续活动的保存间隔。令 \(\Delta_s\) 为 \(\Delta t\) 的整数倍，Duration 为 \(\Delta_s\) 的整数倍。刺激边界、LIF 的突触延迟和不应期也对齐积分网格。较密的保存点有助于显示快速变化。检验积分误差则需要减小 \(\Delta t\)。</p>
<p>率模型用四阶 Runge–Kutta 法推进状态。每步保持左端的 OU 噪声值，下一网格点按 OU 过程的精确高斯转移抽取。矩形刺激在边界处切换，正弦刺激每步取中点值。改变步长也改变随机数与时刻的对应关系。检验确定性轨迹的步长收敛时，可将 Noise SD 设为零。</p>
<p>LIF 先接收本步到达的突触事件，再按指数衰减更新电导与适应电流。膜电位按本步中点的电导和适应电流作指数更新。步末达到阈值即记一次放电并复位，每步每个神经元最多记录一次事件。设为零延迟时，下游从该事件发生后的第一个积分区间开始接收输入。不应期内电位保持在复位值，电导和适应电流继续衰减。</p>
<p>GIF frame interval (sim. ms) 单独控制导出动画相邻帧跨过的模拟时间，默认 20 ms。实际间隔向上对齐保存间隔；它不改变积分、保存点或 CSV。比如 Sample interval 为 2 ms，GIF frame interval 为 2 ms，以 0.1× 导出：每帧推进 2 ms 模拟时间、显示 20 ms，1000 ms 的记录导出为 500 帧、总长 10 秒。GIF 最多导出 2,000 帧；需要更细的帧间隔时，同时降低播放速度，以保证每帧至少显示 20 ms。</p>
<p>网络最多可设为 1,000 个神经元。长记录、密集连接和多通道投影会增加计算量。扩大网络时，可从环、链或低连接概率的随机网络开始，按要分辨的时间尺度选择采样间隔，再指定需要分析的读出通道。</p>
`,
      recording: String.raw`
<p>每次实验都演化完整的 \(N\) 个神经元。Recording 决定从中读取哪些神经元，或怎样把它们混合为 \(m\) 个通道。记某时刻的全网活动为 \(z(t)\)，读出矩阵为 \(R\in\mathbb R^{m\times N}\)，读出为 \(y(t)\)。对同一组样本、相同的中心化与归一化，有</p>
<div class="equation">\[
  y(t)=Rz(t),\qquad \widehat C_y=R\widehat C_zR^T.
\]</div>
<h4>记录单个神经元</h4>
<p>每个通道取一个神经元的原始活动。此时读出协方差是全网协方差的相应主子矩阵，其中仍包含未记录神经元经网络传递的影响。</p>
<ul>
  <li><strong>Random subsampling</strong> 从全网均匀、无放回地随机选取 \(m\) 个神经元。可用 Readout seed 重现这组编号。</li>
  <li><strong>Manual subset</strong> 按 Recorded IDs 手选。如 <code>1, 4, 7-10</code>。<strong>First neurons</strong> 取编号最小的 \(m\) 个。</li>
  <li><strong>Evenly spaced subset</strong> 将按编号排列的全网分成 \(m\) 个等长区段，在每段中间取一个编号。这里的间距按编号计算。</li>
  <li><strong>Within-group subset</strong> 按 Group ID，从指定组中选取编号最小的 \(m\) 个成员。E/I 网络的两组依次为 E、I，Clustered 网络按簇编号分组。</li>
</ul>
<h4>记录活动的线性投影</h4>
<ul>
  <li><strong>Random orth. projection</strong> 抽取 \(m\) 个均匀随机的正交方向（Haar 分布），以它们为 \(R\) 的行。每行长度为 1，各行相互正交，即 \(RR^T=I_m\)。若全网协方差为 \(I_N\)，每个读出仍有单位方差。若 \(m=N\)，这相当于正交换基，协方差特征值和参与率都保留。</li>
  <li><strong>i.i.d. Gaussian projection</strong> 将各权重独立地抽自同一高斯分布 \(R_{ai}\sim\mathcal N(0,1/N)\)。\(1/N\) 是方差，标准差为 \(1/\sqrt N\)。权重使用其抽样值。当 \(N\) 大且 \(m/N\) 很小时，各行近似正交归一。通道比例较大时，行长与方向的波动也会影响读出谱。</li>
</ul>
<p>当全网协方差系综具有正交不变性，且读出独立于网络时，随机子集与随机正交投影给出相同的谱分布。对于有明确分簇或局部刺激的网络，直接选择细胞可保留组别与位置，投影则把不同位置的活动按正、负权重组合起来。</p>
<p>Baseline 与 Stimulus 共用同一个 \(R\)。网络和输入设置已运行后，可以直接修改 Recording，用已有轨迹计算新的读出。Resample readout 只更换随机子集或投影的种子，Export readout matrix 可保存这一组通道的确切权重。</p>
`,
      traces: String.raw`
<p>横轴是正式记录后的时间。选择神经元时，每条曲线给出一个神经元的 \(r_i(t)\) 或 LIF 膜电位 \(V_i(t)\)。投影时，曲线分别为 \(Rr\) 或 \(RV\) 的一个分量。LIF 的阈值与复位属于原神经元。若要定位放电时刻，可在 Raster 查看事件。</p>
<p>Baseline + Stimulus 用同色虚线和实线叠放同一通道的基线与刺激轨迹。Difference 逐时刻计算刺激值减去基线值。LIF 的差值也会随两次放电和复位的时刻变化。上方的编号框选择显示哪些已记录通道，From 和 To 改变时间范围。锁住窗口后可平移而保持宽度。</p>
<p>绿色背景带标出刺激时段。Show stimulus 可叠加独立纵轴上的橙色指令波形，Input 选择要查看的目标或投影通道。它显示 \(u_i(t)\) 或 \((Ru(t))_a\)，背景驱动和噪声另行进入模型。读数区可同时查看活动与指令输入的数值。</p>
`,
      raster: String.raw`
<p>横轴是时间，每行对应一个已记录神经元或投影通道。对于 LIF 神经元子集，短线表示一次放电，时刻按积分步长记录。选择 Baseline 或 Stimulus，可看到单个神经元的放电间隔以及不同神经元是否在相近时刻放电。</p>
<p>率模型使用热图，以颜色表示各行在每个保存时刻的活动。投影读出也使用热图，LIF 此时显示混合膜电位 \(RV\)。连续热图可切换为 Difference，逐行查看两种条件的活动差。</p>
`,
      population: String.raw`
<p>率模型在每个保存时刻对已记录神经元的 \(r_i\) 求平均。若网络有 E/I 或簇分组，可在 Aggregation 选择 By group，分别平均每组实际记录到的神经元。曲线标签给出参与平均的数量。</p>
<p>LIF 按选定区间的起点划分不重叠的完整窗口。若 \(m_g\) 个神经元在宽 \(T\) 秒的窗口内共发放 \(S_g\) 次，该组的平均发放率为 \(S_g/(m_gT)\)，单位为每个神经元的 Hz，点画在窗中心。例如 5 个神经元在 100 ms 内共放电 10 次，均值为 20 Hz。加宽窗口能平滑短时起伏，同时降低时间分辨率。</p>
<p>投影时，Population 对读出通道求均值。对 LIF，先把每个神经元的窗内计数除以 \(T\)，用 \(R\) 混合这些速率，再对通道平均。因此 Mean projected rate 随投影方向而变，也可能为负。</p>
`,
      covariance: String.raw`
<h4>矩阵怎样计算</h4>
<p>在所选条件和时间区间内，Estimator 决定什么算作一个样本。每个样本是 \(m\) 个通道的向量 \(y_k\)。程序先由 \(M\) 个样本求出通道均值向量 \(\bar y\)，从每个向量中减去它，再求样本协方差。</p>
<div class="equation">\[
  \widehat C=\frac{1}{M-1}
       \sum_{k=1}^{M}(y_k-\bar y)(y_k-\bar y)^T.
\]</div>
<p>热图的对角元是单个通道的方差。非对角元为正时，两通道偏离各自均值的方向倾向一致，为负时倾向相反。矩阵保留了各通道的活动尺度。Difference 先求 \(y_{\mathrm{stim}}-y_{\mathrm{base}}\)，再对差值求协方差，因此估计量包含两条轨迹的交叉协方差。若选定区间跨越刺激起点或持续漂移，随时间改变的平均响应也会贡献方差。</p>
<ul>
  <li><strong>Equal-time</strong> 把每个保存时刻的活动向量作为样本，包含区间两端。LIF 使用膜电位，率模型使用连续活动。</li>
  <li><strong>Window mean</strong> 将区间划成相邻、等长、互不重叠的窗口。对每个完整窗口取连续信号的算术均值，计入左端点，排除右端点。每个窗口贡献一个样本。</li>
  <li><strong>Integrated</strong> 将 Window mean 的协方差乘以窗口时长 \(T\)（秒）。Equal-time 和 Window mean 对电位的单位为 \(\mathrm{mV}^2\)，Integrated 为 \(\mathrm{mV}^2\!\cdot\!\mathrm{s}\)。连续率模型相应为无量纲活动的平方，Integrated 再乘秒。</li>
  <li><strong>Binned rate</strong> 适用于 LIF。对每个神经元，统计每个完整窗口 \((t,t+T]\) 内的放电数，再除以 \(T\) 得到 Hz。投影时用 \(R\) 混合这些速率。所得协方差的单位为 \(\mathrm{Hz}^2\)。</li>
</ul>
<p>窗口估计从 From 起算，末尾未满一窗的部分舍去。至少需要两个保存点或两个完整窗口。一次协方差分析可包含至多 192 个读出通道。较大网络可用 Recording 选取要分析的子集或投影方向。</p>
<h4>积分协方差与窗口时长</h4>
<p>对于平稳过程，令 \(K(s)\) 表示时滞 \(s\) 的协方差矩阵，\(\bar y_T\) 为宽 \(T\) 秒的连续时间窗口平均。有限窗口对各时滞的权重呈三角形。</p>
<div class="equation">\[
  \begin{aligned}
  C_T&=T\operatorname{Cov}(\bar y_T)\\
     &=\int_{-T}^{T}\!\left(1-\frac{|s|}{T}\right)K(s)\,\mathrm ds .
  \end{aligned}
\]</div>
<p>对于连续的 \(K(s)\)，很短的窗口使窗口均值的协方差接近 \(K(0)\)。若时滞协方差可积，\(T\) 增大时，\(C_T\) 趋向所有时滞的积分，即零频协方差。图中 Integrated 用离散保存的有限轨迹估计 \(C_T\)。若从放电计数计算同一归一化的量，应将计数协方差除以 \(T\)，等价于给 Binned rate 协方差再乘 \(T\)。</p>
<h4 id="theory-spectrum">特征值与参与率</h4>
<p>柱状图按降序给出 \(\widehat C\) 的特征值 \(\lambda_k\)。每个特征值是数据沿一个主轴的方差。参与率（Participation ratio，\(D\)）用这些方差衡量波动分布在多少个有效方向上。</p>
<div class="equation">\[
  D=\frac{\left(\sum_k\lambda_k\right)^2}{\sum_k\lambda_k^2}.
\]</div>
<p>若方差集中在一个方向，\(D=1\)。若在 \(q\) 个方向上均匀分布，\(D=q\)。其他分布可给出非整数。总方差为零时参与率无定义，界面显示横线。Relative PR 为 \(D/m\)，表示有效维数占读出通道数的比例。在 Hu 与 Sompolinsky 分析的大网络随机压缩极限中，保留较少通道时，绝对参与率可下降，而有效维数占保留通道的比例可上升。</p>
<p>Spatial fraction \(f=m/N\) 衡量记录了多少空间维度，Sample ratio \(m/M\) 表示通道数与样本数之比。中心化后，矩阵的秩至多为 \(\min(m,M-1)\)。例如三个通道最多给出三个特征值。相邻时刻或相邻窗口可能相关，\(M\) 统计实际用到的向量数。固定记录时长而加宽窗口，会同时改变每个样本的内容和可用样本数。比较两张谱时应一并查看估计方式、\(T\)、\(m\) 和 \(M\)。</p>
`,
      connectivity: String.raw`
<p><strong>Nodes</strong> 与 <strong>Connectivity matrix J</strong> 显示同一张完整网络。箭头从发送者指向接收者，绿色实线表示正权重，橙色虚线表示负权重。较密网络的 Overview 按权重绝对值显示较强的连接。要查看一个神经元的输入和输出，可选择它并将 Edges 切到 Selected neuron，再在 Incoming 和 Outgoing 表核对权重。</p>
<p>在矩阵中，列是发送者、行是接收者。例如查看 \(1\to3\)，读第 3 行、第 1 列。率模型的矩阵元素是无量纲耦合强度，LIF 的绝对权重是一次到达事件引起的电导增量（nS）。协方差热图则度量共同波动，其中会包含间接通路和共享输入的影响。</p>
<p>Nodes 的 Recording 或 Structure 显示网络结构，橙色边框标出刺激目标。改选 Baseline、Stimulus 或 Difference 后，节点颜色随时间显示原神经元的活动。同一条件在整段记录中使用固定色标。放大 Nodes 可拖动时间轴并读取表中各神经元的值。投影模式下，表中给出全网原神经元的活动，各通道的具体权重见导出的读出矩阵。</p>
<p>全屏中点击 Relax layout by connection strength 可切换到力导向布局。节点相互排斥，连接按权重绝对值提供吸引，并以原布局为位置参考。位置仅用于绘图。播放速度默认为 1.0×，即模拟中的 1000 ms 对应现实中的 1 秒，可在 0.02× 至 10× 之间调整；X／C 减速或加速，步长随速度区间变化：0.02–0.1 为 0.02，0.1–0.3 为 0.05，0.3–3 为 0.1，3–10 为 1。拖动时间轴可停在某一帧，比较该时刻各神经元的活动。</p>
`,
      compare: String.raw`
<p>在一次已完成实验的 Traces 或 Connectivity 中点击图钉，保留它的配置、网络、读出和轨迹作为 Reference。更改参数并运行，或更换同次实验的读出，再打开 Compare。左边是固定的 Reference，右边是最新完成的 Current。下方 Configuration changes 列出有变化的设置和读出编号。</p>
<p>在 Traces 中，两侧可各选自己的神经元或投影通道。时间轴共用，活动单位相同时也共用纵轴。在 Connectivity 中，播放按两次记录重叠的时长推进，每侧使用最接近当前时刻的保存点。单位相同时，两侧共用活动色标。播放速度同时作用于两侧，可用 X／C 按分段步长调整。Difference 在每侧内部各自计算 Stimulus − Baseline。</p>
<p>编号属于各自的实验。要比较同一个神经元对两种刺激的反应，可固定拓扑、参数、Network seed 与 Noise seed，只改变刺激。比较投影通道时，也要核对两次实验的 \(R\)，相同通道编号对应的是该次读出矩阵的同一行号。</p>
`,
      exports: String.raw`
<ul>
  <li><strong>Export config / Import config</strong> 保存或载入实验设置（JSON），包括自定义连接、刺激程序与三个随机种子。载入后按这套参数重新运行。Compare 中的 Export reference config 保存固定实验的参数。</li>
  <li><strong>Export data</strong> 将当前已完成实验的全部记录时间导出为 CSV。每行是一个保存时刻，包括刺激指令、两种条件的活动或膜电位。LIF 另有自上次保存以来的放电计数。投影时为带正负权重的计数。</li>
  <li><strong>Export spikes</strong> 位于 LIF 神经元子集的 Raster 中。CSV 逐事件给出条件、原神经元编号和放电时刻（ms），保留积分网格的时间分辨率。</li>
  <li><strong>Export connectivity</strong> 在 Connectivity 中导出增益调整后的完整 \(J\)。<strong>Export readout matrix</strong> 在 Recording 中导出实际使用的 \(R\)，行对应读出，列对应原神经元。</li>
  <li><strong>Export covariance</strong> 导出当前条件、区间和估计方式对应的样本协方差矩阵。复现一张谱时，还需记下这些分析选项和窗口宽度。读出方式与种子可随实验配置保存。</li>
  <li><strong>Download activity GIF</strong> 保存 Nodes 中的活动动画，或 Compare 的 Connectivity 双图动画。导出使用当前播放速度，完整播放一次。比较图使用两次实验共有的记录时长。GIF 时长取整到 10 ms，单帧至少 20 ms；很短的高速动画会受此限制。</li>
</ul>
`,
      sources: String.raw`
<ul>
  <li><strong>率模型与随机反馈。</strong> Sompolinsky、Crisanti 与 Sommers（1988）分析随机非对称率网络在大网络极限下的动力学，为 Random rate network 预设提供背景。<a href="https://doi.org/10.1103/PhysRevLett.61.259" target="_blank" rel="noopener noreferrer"><cite>Chaos in Random Neural Networks</cite></a>。</li>
  <li><strong>低秩连接。</strong> Mastrogiuseppe 与 Ostojic（2018）将循环连接分解为随机部分与低秩结构。Low-rank 预设采用其中左右向量相同的对称结构项。<a href="https://arxiv.org/abs/1711.09672" target="_blank" rel="noopener noreferrer"><cite>Linking connectivity, dynamics and computations in low-rank recurrent neural networks</cite></a>。</li>
  <li><strong>放电模型与电导。</strong> Gerstner 等的教材给出膜电位积分、阈值与复位，以及突触电导和反转电位的定义。<a href="https://neuronaldynamics.epfl.ch/online/Ch1.S3.html" target="_blank" rel="noopener noreferrer"><cite>Neuronal Dynamics</cite> §1.3</a>、<a href="https://neuronaldynamics.epfl.ch/online/Ch3.S1.html" target="_blank" rel="noopener noreferrer">§3.1</a>。</li>
  <li><strong>兴奋性与抑制性网络。</strong> Brunel（2000）分析稀疏 E/I 放电网络的群体状态。E/I spiking network 预设用按细胞区分符号的出边，并采用电导突触和 OU 背景输入。<a href="https://link.springer.com/article/10.1023/A:1008925309027" target="_blank" rel="noopener noreferrer"><cite>Dynamics of Sparsely Connected Networks of Excitatory and Inhibitory Spiking Neurons</cite></a>。</li>
  <li><strong>刺激与自发活动。</strong> Rajan、Abbott 与 Sompolinsky（2010）研究输入怎样改变循环网络原有的波动，可与 Paired 条件下的轨迹变化对照阅读。<a href="https://doi.org/10.1103/PhysRevE.82.011903" target="_blank" rel="noopener noreferrer"><cite>Stimulus-dependent suppression of chaos in recurrent neural networks</cite></a>。</li>
  <li><strong>读出、协方差谱与有限采样。</strong> Hu 与 Sompolinsky（2022）在稳定线性网络和独立白噪声输入下研究长期积分协方差。正文 §2.1 式（2）给出零频协方差，§3.7 讨论时空采样，§5.6 式（37）给出放电计数的窗口归一化。补充材料 §H（第 26–29 页）使用独立的零均值高斯时间样本。§I（第 30–32 页）区分坐标子采样、随机正交投影和高斯投影。式（S104）–（S105）给出随机压缩极限下的参与率，式（S107）说明读出后的采样比 \(m/M=f(N/M)\)。<a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer"><cite>The spectrum of covariance matrices of randomly connected recurrent neuronal networks with linear dynamics</cite></a>、<a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text</a>。</li>
  <li><strong>课程与项目材料。</strong> 状态和输出活动的区分参照温泉 <cite>Attractor Dynamics and Recurrent Networks</cite> 第 1–3 页，参与率的解释参照其 <cite>Geometry of Population Neural Activity and Analysis Methods</cite> 第 21 页。按条件对照动力学的思路来自春季课程 <cite>Homework 2</cite>。项目笔记《随机循环网络协方差谱：理论推导与适用范围》第 1、5 节及《少量神经元能留下哪些谱信息》分别补充窗口归一化与部分观测的讨论。<a href="https://github.com/Wenlab/Computation-Neuro-Course/blob/Spring-2026/README.md" target="_blank" rel="noopener noreferrer">课程资料</a>。</li>
</ul>
`
    },
    en: {
      presets: String.raw`
<p>Selecting a preset loads its settings and runs the experiment. Each experiment simulates two conditions on the same network. Baseline receives background input. Stimulus also applies the chosen waveform to its targets. In Traces you can overlay the two responses or display their pointwise difference, Stimulus − Baseline.</p>
<dl>
  <dt><strong>Ring propagation</strong></dt>
  <dd>Twelve linear rate neurons form a directed loop. Neuron 1 receives a brief pulse. Follow the peaks of the difference traces in neuron order to see how the response travels around the loop and returns to its starting point.</dd>
  <dt><strong>Feedforward propagation</strong></dt>
  <dd>Twelve linear rate neurons form a one-way chain. At each stage the neuron integrates its upstream input over its own time constant. Compare how the pulse peaks later and spreads in time along the chain. This preset also changes the gain from the ring preset. Set Gain to the same value in both runs to isolate the effect of closing the loop.</dd>
  <dt><strong>Random rate network</strong></dt>
  <dd>Random positive and negative connections couple 48 Tanh neurons. Hold the network and noise seeds fixed and vary Gain to see how feedback amplifies, attenuates or redistributes a local pulse.</dd>
  <dt><strong>Low-rank network</strong></dt>
  <dd>The connections among 48 Tanh neurons contain two rank-one terms and a random component. Neurons 1–8 receive the same pulse. Changing Random bulk strength and comparing covariance eigenvalues shows how population variance is distributed across activity directions.</dd>
  <dt><strong>Clustered network</strong></dt>
  <dd>Thirty-six Sigmoid neurons form three clusters with positive connections within clusters and negative connections between them. The stimulus targets neurons 1–5 in the first cluster. To show all three groups in Population, select Evenly spaced subset in Recording, then choose By group.</dd>
  <dt><strong>Partial observation</strong></dt>
  <dd>Thirty-two linear rate neurons receive temporally correlated noise. By default the run records eight seconds of spontaneous activity and reads out 12 randomly selected neurons. Reduce this to three neurons or switch to a projection to compare covariance, eigenvalues and effective dimension on the same activity.</dd>
  <dt><strong>E/I spiking network</strong></dt>
  <dd>Sixty-four conductance-based LIF neurons form excitatory and inhibitory populations. Neurons 1–8 receive a current pulse. Raster shows individual spikes, and By group in Population compares the mean firing rates of the recorded neurons in the two populations.</dd>
  <dt><strong>Spike-frequency adaptation</strong></dt>
  <dd>A single LIF neuron with no synaptic input receives a sustained current step. Each spike increases its adaptation current. Inspect the intervals between spikes in Raster, then change Adaptation increment from 32 pA to zero to compare firing patterns under the same step.</dd>
</dl>
`,
      models: String.raw`
<h4>Rate models</h4>
<p>Neuron \(i\) has an internal state \(x_i\) and sends activity \(r_i=\phi(x_i)\) to its targets. The terms on the right describe leak, recurrent input, a constant background drive \(b\), background noise \(\eta_i\) and the stimulus \(u_i\). The time constant \(\tau\) (ms) sets how quickly the state responds to input.</p>
<div class="equation">\[
  \begin{aligned}
  \tau\dot x_i &= -x_i+\sum_j J_{ij}r_j\\
               &\quad+b+\eta_i(t)+u_i(t),\\
  r_i &= \phi(x_i).
  \end{aligned}
\]</div>
<ul>
  <li><strong>Linear rate</strong> uses \(\phi(x)=x\). Under the same background input, the difference between two trajectories obeys a linear equation, so it tracks the propagation of the stimulus response.</li>
  <li><strong>Tanh rate</strong> uses \(\phi(x)=\tanh x\). The output can deviate in either direction from zero and saturates toward \(+1\) or \(-1\).</li>
  <li><strong>Sigmoid rate</strong> uses \(\phi(x)=1/(1+e^{-x})\). The output lies between 0 and 1, with \(r=0.5\) at \(x=0\).</li>
</ul>
<p>State, activity, weights and inputs are dimensionless in all three models. Initial SD sets the Gaussian spread of \(x_i\) about zero. The recorded variable is \(r_i\), after applying \(\phi\). In the linear model, once a pulse ends, the difference between the perturbed and unperturbed trajectories eventually decays if every eigenvalue of \(J\) has real part below one. Near a fixed point in a nonlinear model, stability also depends on the local slopes \(\phi'(x_i)\).</p>
<h4>Conductance-based leaky integrate-and-fire model (LIF)</h4>
<p>The membrane capacitance \(C_{\mathrm m}\) stores charge. The leak, excitatory and inhibitory conductances \(g_{\mathrm L},g_{\mathrm E,i},g_{\mathrm I,i}\) each drive the voltage \(V_i\) toward their respective reversal potentials \(E_{\mathrm L},E_{\mathrm E},E_{\mathrm I}\). An adaptation current \(a_i\) opposes depolarizing input.</p>
<div class="equation">\[
  \begin{aligned}
  C_{\mathrm m}\dot V_i &= g_{\mathrm L}(E_{\mathrm L}-V_i)\\
   &\quad+g_{\mathrm E,i}(E_{\mathrm E}-V_i)\\
   &\quad+g_{\mathrm I,i}(E_{\mathrm I}-V_i)\\
   &\quad+b+\eta_i(t)+u_i(t)-a_i.
  \end{aligned}
\]</div>
<p>Capacitance is in pF, conductance in nS, voltage in mV and currents in pA. Initial SD sets the spread of the initial voltage around the leak reversal potential. With only the leak conductance open, the membrane time constant is \(C_{\mathrm m}/g_{\mathrm L}\). For example, \(200\,\mathrm{pF}\) and \(10\,\mathrm{nS}\) give \(20\,\mathrm{ms}\). Opening synaptic conductances increases total conductance and shortens the effective time constant.</p>
<p>Reaching Spike threshold registers a spike. The membrane returns to Reset potential and remains there for the Refractory period. After the Synaptic delay, a positive weight increases the target's excitatory conductance by \(J_{ij}\), and a negative weight increases inhibitory conductance by \(|J_{ij}|\). The two conductances decay exponentially with E decay time and I decay time. Each spike also increases the spiking cell's \(a_i\) by Adaptation increment. Adaptation decay sets its decay time constant. Set the increment to zero to switch adaptation off.</p>
`,
      network: String.raw`
<p>Neurons sets the network size \(N\). A column of the matrix \(J\) contains the outgoing weights of a source, and a row contains those arriving at a target. Thus \(J_{ij}\) denotes \(j\to i\). Gain multiplies every weight after network generation, including a custom matrix. LIF and E/I require a nonnegative gain to preserve excitatory and inhibitory weight signs.</p>
<ul>
  <li><strong>Directed ring and Feedforward chain</strong> connect \(1\to2\to\cdots\to N\). The ring adds \(N\to1\). The base weight is 1. With Relative weight jitter \(\delta\), each weight is independently multiplied by a factor drawn uniformly from \([1-\delta,1+\delta]\).</li>
  <li><strong>Random</strong> draws each off-diagonal edge independently with Connection probability \(p\). Nonzero weights are Gaussian with mean zero and standard deviation \(s=1/\sqrt{\max(1,pN)}\) before gain is applied. The two directions are drawn separately.</li>
  <li><strong>E/I</strong> assigns the first \(\lfloor f_{\mathrm E}N\rfloor\) neurons to the excitatory population, where \(f_{\mathrm E}\) is E fraction. The others are inhibitory. A neuron's type determines the sign of its outgoing weights. Excitatory base weights are \(s\). The magnitude of inhibitory weights is multiplied by I/E weight ratio. Off-diagonal edges of either type are drawn with probability \(p\) and can have relative weight jitter.</li>
  <li><strong>Clustered</strong> divides neurons in ID order into \(K\) clusters. Off-diagonal edges are drawn with probability \(p\). The within-cluster base weight is \(1/\max(1,pN/K)\). Between-cluster weights also receive the Between/within weight multiplier. Relative jitter can be applied to both. A zero multiplier disconnects the clusters, and a negative value reverses the sign of between-cluster coupling.</li>
  <li><strong>Low-rank</strong> draws a vector \(v_k\) of random signs \(\pm1\) for each of the Rank-one terms. It adds \(v_kv_k^T/N\), including its diagonal, to the structured component. This component is symmetric and its rank is at most the number of terms. Random bulk strength rescales an additional sparse Gaussian component. Connection probability \(p\) controls the edges of this random component.</li>
  <li><strong>Custom</strong> accepts an Edge list or a Dense matrix. Each edge-list row specifies source, target and weight. For example, <code>1, 3, -0.6</code> puts \(-0.6\) in row \(3\), column \(1\). Unlisted edges have weight zero. Each row of a dense matrix lists all weights arriving at one target. Both formats allow self-connections.</li>
</ul>
<p>With the topology and its parameters fixed, Network seed regenerates the same weights. Resample network (F5) changes the seed and reruns a network with random connections or weight jitter. Sparse networks are a practical starting point at larger sizes because the solver accumulates input from each connection at every step.</p>
`,
      input: String.raw`
<h4>Background drive and noise</h4>
<p>Background drive is a constant \(b\) applied to every neuron. Noise SD (\(\sigma\)) is the stationary standard deviation of the noise input to one neuron. Noise correlation time (\(\tau_\eta\)) controls how long a fluctuation persists. Increasing it at fixed \(\sigma\) makes the noise vary more slowly while preserving its stationary standard deviation. Input is dimensionless in rate models and in pA for LIF.</p>
<p>The noise is built from independent Ornstein–Uhlenbeck processes of unit stationary variance. Every neuron receives a common component \(z_0\) and a private component \(z_i\). Shared variance fraction \(c\) is the fraction contributed by the common component.</p>
<div class="equation">\[
  \begin{aligned}
  \eta_i(t)&=\sigma\bigl(\sqrt{c}\,z_0(t)+\sqrt{1-c}\,z_i(t)\bigr),\\
  \operatorname{Cov}[z_k(t),z_k(t+s)]&=e^{-|s|/\tau_\eta}.
  \end{aligned}
\]</div>
<p>The noise inputs are independent at \(c=0\) and identical at \(c=1\). For \(\sigma>0\), the zero-lag correlation between noise inputs to different neurons is \(c\). Correlations between their recorded activities also reflect recurrent coupling and the neuronal response function.</p>
<h4>Stimulus waveforms</h4>
<p>Target IDs accepts individual IDs, ranges or <code>all</code>. Onset is measured from \(0\,\mathrm{ms}\) of the saved record. Amplitude applies to the target neurons.</p>
<ul>
  <li><strong>None</strong> leaves the background drive and noise active.</li>
  <li><strong>Square pulse</strong> applies a constant amplitude for the specified Duration. <strong>Step</strong> continues from Onset to the end of the record.</li>
  <li><strong>Paired pulses</strong> applies two square pulses of equal width and amplitude. Onset interval measures the time between their starts. Overlapping amplitudes add.</li>
  <li><strong>Sinusoidal</strong> applies a sine wave starting at zero phase for the specified duration. Frequency is in Hz and Amplitude is the peak amplitude.</li>
  <li><strong>Custom sequence</strong> accepts a start time (ms), duration (ms), amplitude and target IDs on each line. For example, <code>120, 30, 1.8, 1 3</code> drives neurons 1 and 3 for 30 ms starting at 120 ms. Events on the same neuron add.</li>
</ul>
<h4>Trial pairing</h4>
<p><strong>Paired</strong> gives both conditions the same initial state and time course of background noise. Their traces coincide before stimulus onset. Difference measures the effect of adding the stimulus against this particular background. The shared additive input cancels in the linear rate model. In a nonlinear model, the subsequent response also depends on the state the stimulus has brought the network into.</p>
<p><strong>Independent</strong> keeps the network fixed and draws an initial state and background noise separately for each condition. A single difference then includes trial-to-trial variability. To estimate a mean effect across trials, keep the network seed fixed and repeat the comparison with different noise seeds. Resample noise (F9) redraws both the initial state and the noise.</p>
`,
      numerics: String.raw`
<p>Duration sets the length of the saved record. During Warm-up the model evolves under background input, and the recording clock then starts at zero. A longer warm-up gives initial transients more time to decay. When analyzing spontaneous fluctuations, inspect the record for a segment with a stable mean and fluctuation amplitude.</p>
<p>Time step (\(\Delta t\)) sets the integration grid. Sample interval (\(\Delta_s\)) is the interval between saved continuous values. Set \(\Delta_s\) to an integer multiple of \(\Delta t\), and Duration to a multiple of \(\Delta_s\). Stimulus boundaries, the LIF synaptic delay and refractory period also align with the integration grid. Denser saved samples reveal faster changes. A smaller \(\Delta t\) tests the accuracy of integration.</p>
<p>GIF frame interval (sim. ms) controls simulated time between exported animation frames, independently of integration, saved samples and CSV output. It defaults to 20 ms and rounds up to a saved-sample interval. With 2 ms saved samples, a 2 ms GIF interval and 0.1× playback, a 1000 ms record produces 500 frames over 10 seconds. Exports support up to 2,000 frames and require at least 20 ms of playback time per frame; lower the playback speed when exporting finer intervals.</p>
<p>Rate models advance with fourth-order Runge–Kutta, holding the left-endpoint OU input constant over each step. The next noise value is drawn using the exact Gaussian transition of the OU process. Square stimuli switch at grid boundaries, and a sine wave is evaluated at each step's midpoint. Changing the step also changes which times receive each noise draw. Set Noise SD to zero when testing step-size convergence of a deterministic trajectory.</p>
<p>LIF receives arriving spikes at the start of a step and decays conductances and adaptation exponentially. Voltage advances with an exponential update using midpoint conductances and adaptation current. Reaching threshold at the end of the step registers a spike and resets the voltage. A neuron can fire at most once per step. With zero delay, the target receives the spike at the start of the next interval. Conductances and adaptation continue to decay while voltage is held at reset during the refractory period.</p>
<p>The network can contain up to 1,000 neurons. Long recordings, dense networks and many projected channels require more computation. For a large network, a ring, a chain or a random network with low connection probability is a practical starting point. Choose a sample interval that resolves the activity of interest and read out the channels you want to analyze.</p>
`,
      recording: String.raw`
<p>Each experiment evolves all \(N\) neurons. Recording selects individual neurons or mixes them into \(m\) channels. Let \(z(t)\) be the vector of full-network activity, \(R\in\mathbb R^{m\times N}\) the readout matrix and \(y(t)\) its output. With the same samples, centering and normalization on both sides, the sample covariances satisfy</p>
<div class="equation">\[
  y(t)=Rz(t),\qquad \widehat C_y=R\widehat C_zR^T.
\]</div>
<h4>Recording individual neurons</h4>
<p>Each channel retains one neuron's original activity. Its covariance with the other selected neurons occupies a principal submatrix of the full-network covariance. Unrecorded neurons can still influence the recorded cells through the network.</p>
<ul>
  <li><strong>Random subsampling</strong> selects \(m\) distinct neurons uniformly without replacement. Readout seed reproduces the IDs.</li>
  <li><strong>Manual subset</strong> uses Recorded IDs, for example <code>1, 4, 7-10</code>. <strong>First neurons</strong> takes the \(m\) lowest IDs.</li>
  <li><strong>Evenly spaced subset</strong> divides the ID range into \(m\) equal intervals and takes a neuron from the middle of each. Spacing is measured in ID order.</li>
  <li><strong>Within-group subset</strong> takes the \(m\) lowest IDs in the selected Group ID. E and I are the first and second groups in an E/I network. A clustered network uses the cluster numbers.</li>
</ul>
<h4>Recording linear projections</h4>
<ul>
  <li><strong>Random orth. projection</strong> draws \(m\) uniformly oriented orthonormal directions (Haar measure) as the rows of \(R\), so \(RR^T=I_m\). If the full covariance is \(I_N\), each channel retains unit variance. At \(m=N\) this is an orthogonal change of basis that preserves covariance eigenvalues and the participation ratio.</li>
  <li><strong>i.i.d. Gaussian projection</strong> draws each weight independently from the same Gaussian distribution, \(R_{ai}\sim\mathcal N(0,1/N)\). The variance is \(1/N\) and the standard deviation is \(1/\sqrt N\). The weights are used as drawn. For large \(N\) and small \(m/N\) the rows are approximately orthonormal. At larger channel fractions, variation in row lengths and directions also affects the spectrum.</li>
</ul>
<p>For a covariance ensemble invariant under orthogonal changes of basis, independently chosen random subsets and random orthogonal readouts yield the same spectral distribution. In a clustered or locally stimulated network, selecting individual cells retains their group and target identities. A projection mixes their activities with positive and negative weights.</p>
<p>Baseline and Stimulus use the same \(R\). After a completed run you can change Recording to read the stored trajectories again. Resample readout redraws the random subset or projection weights, and Export readout matrix saves the coefficients of the current channels.</p>
`,
      traces: String.raw`
<p>The horizontal axis is time since the start of the saved record. For a neuron subset each curve is one neuron's \(r_i(t)\) or its LIF membrane potential \(V_i(t)\). For a projection it is a component of \(Rr\) or \(RV\). Threshold and reset belong to the underlying LIF neurons. Raster provides their spike times.</p>
<p>Baseline + Stimulus overlays a channel's dashed baseline and solid stimulus trace in the same color. Difference computes Stimulus − Baseline at each time. In LIF, voltage differences also reflect changes in the timing of spikes and resets. The ID field selects which recorded channels to plot. From and To set the time range, which can be locked and panned at constant width.</p>
<p>Green bands mark stimulus intervals. Show stimulus overlays the orange command waveform on its own vertical scale. Input selects a target or projected channel, displaying \(u_i(t)\) or \((Ru(t))_a\). Background drive and noise enter separately in the model. The readout lists numeric values for activity and the command.</p>
`,
      raster: String.raw`
<p>Time runs horizontally, with one recorded neuron or channel per row. For an LIF neuron subset, each tick is a spike timed on the integration grid. Select Baseline or Stimulus to inspect intervals between spikes in a neuron and the timing of events across neurons.</p>
<p>For rate models, color encodes activity at each saved time. A projection also gives a continuous heatmap, showing the mixed voltage \(RV\) for LIF. The continuous heatmaps offer Difference to display the change between the two conditions in each row.</p>
`,
      population: String.raw`
<p>For rate models, Population averages \(r_i\) over the recorded neurons at each saved time. For E/I or clustered networks, select By group under Aggregation to average the recorded members of each group separately. The labels give the number included in each mean.</p>
<p>For LIF, non-overlapping complete windows start at the beginning of the selected interval. If \(m_g\) neurons fire \(S_g\) spikes in a window of \(T\) seconds, their mean firing rate is \(S_g/(m_gT)\) in Hz per neuron, plotted at the window center. For example, 10 spikes from five neurons in 100 ms give 20 Hz per neuron. A longer window smooths short fluctuations and coarsens temporal resolution.</p>
<p>For projected records the plot averages channels. For LIF it divides each neuron's binned spike count by \(T\), mixes the resulting rates with \(R\), then averages channels. The mean projected rate depends on the readout directions and can be negative.</p>
`,
      covariance: String.raw`
<h4>How the matrix is calculated</h4>
<p>Estimator defines a sample within the chosen condition and time interval. Each sample is a vector \(y_k\) of \(m\) channel values. The program computes the vector of channel means \(\bar y\) across \(M\) samples, subtracts it from every sample and forms the sample covariance.</p>
<div class="equation">\[
  \widehat C=\frac{1}{M-1}
       \sum_{k=1}^{M}(y_k-\bar y)(y_k-\bar y)^T.
\]</div>
<p>The heatmap diagonal gives each channel's variance. A positive off-diagonal entry indicates that the two channels tend to deviate from their means in the same direction. A negative entry indicates opposite deviations. Entries retain the scale of the activities. Difference takes \(y_{\mathrm{stim}}-y_{\mathrm{base}}\) before computing covariance, so the estimate includes cross-covariance between the two trajectories. A window spanning a stimulus onset or a drift in activity also includes variation in the mean response over time.</p>
<ul>
  <li><strong>Equal-time</strong> uses the activity vector at each saved time, including both endpoints of the analysis interval. The continuous variable is membrane potential for LIF and output activity for a rate model.</li>
  <li><strong>Window mean</strong> divides the interval into consecutive non-overlapping windows. Each complete window contributes one sample, the arithmetic mean of the continuous values from its left endpoint up to but excluding its right endpoint.</li>
  <li><strong>Integrated</strong> multiplies the Window mean covariance by window duration \(T\) in seconds. Equal-time and Window mean voltage covariances have units of \(\mathrm{mV}^2\), and Integrated has units of \(\mathrm{mV}^2\!\cdot\!\mathrm{s}\). Rate-model activity is dimensionless, with an additional factor of seconds for Integrated.</li>
  <li><strong>Binned rate</strong> is available for LIF. For each neuron it counts spikes in each complete window \((t,t+T]\) and divides by \(T\) to obtain Hz. A projected readout mixes these rates with \(R\). The covariance has units of \(\mathrm{Hz}^2\).</li>
</ul>
<p>Window estimators begin at From and discard an incomplete final window. At least two saved points or two complete windows are required. A covariance analysis can use up to 192 channels. For larger networks, choose the subset or projection of interest in Recording.</p>
<h4>Integrated covariance and window duration</h4>
<p>For a stationary process, let \(K(s)\) denote covariance at lag \(s\) and \(\bar y_T\) the continuous-time average over \(T\) seconds. A finite window weights the lags by a triangular function.</p>
<div class="equation">\[
  \begin{aligned}
  C_T&=T\operatorname{Cov}(\bar y_T)\\
     &=\int_{-T}^{T}\!\left(1-\frac{|s|}{T}\right)K(s)\,\mathrm ds .
  \end{aligned}
\]</div>
<p>For continuous \(K(s)\), the covariance of a short-window mean approaches \(K(0)\) as the window shrinks. For integrable lag covariance, \(C_T\) approaches the integral over all lags as \(T\) grows, giving the zero-frequency covariance. The Integrated plot estimates \(C_T\) from a finite, discretely saved record. To use this normalization with spikes, divide spike-count covariance by \(T\), equivalently multiply Binned rate covariance by \(T\).</p>
<h4 id="theory-spectrum">Eigenvalues and participation ratio</h4>
<p>The bars show the eigenvalues \(\lambda_k\) of \(\widehat C\), sorted from largest to smallest. Each is the variance along one principal axis. The participation ratio \(D\) measures the effective number of directions carrying that variance.</p>
<div class="equation">\[
  D=\frac{\left(\sum_k\lambda_k\right)^2}{\sum_k\lambda_k^2}.
\]</div>
<p>If one direction carries all variance, \(D=1\). If variance is shared equally among \(q\) directions, \(D=q\). Other distributions can give noninteger values. A dash indicates that total variance is zero and the ratio is undefined. Relative PR is \(D/m\), the effective dimension as a fraction of the readout dimension. In the large-network random-compression limit analyzed by Hu and Sompolinsky, retaining fewer channels can lower the absolute participation ratio while raising the fraction of retained dimensions occupied by the fluctuations.</p>
<p>Spatial fraction \(f=m/N\) describes the fraction of spatial dimensions retained. Sample ratio \(m/M\) compares channels with samples. Centering bounds the rank by \(\min(m,M-1)\). Three channels, for example, yield at most three eigenvalues. Successive points or windows may be correlated, and \(M\) counts the vectors used. Widening windows in a fixed recording changes both what each sample measures and how many samples remain. When comparing spectra, keep track of the estimator, \(T\), \(m\) and \(M\).</p>
`,
      connectivity: String.raw`
<p><strong>Nodes</strong> and <strong>Connectivity matrix J</strong> show the full network. Arrows point from source to target. Positive weights appear as solid green lines and negative weights as dashed orange lines. In dense networks, Overview displays the strongest connections by absolute weight. Select a neuron and switch Edges to Selected neuron to inspect its inputs and outputs. The Incoming and Outgoing tables give their weights.</p>
<p>In the matrix, columns are sources and rows are targets. To find \(1\to3\), read row 3, column 1. A rate-model weight is a dimensionless coupling strength. In LIF, its magnitude is the conductance increment per arriving spike in nS. The covariance heatmap measures co-fluctuations, which can also arise from indirect pathways or shared inputs.</p>
<p>In Nodes, Recording or Structure shows the wiring. Orange borders mark stimulus targets. Select Baseline, Stimulus or Difference to color the original neurons by their activity at each time. A condition's color scale is fixed across the recording. Expand Nodes to scrub the timeline and read individual neuronal values. With projected recording, the table shows the underlying full-network neurons. Each channel's coefficients are available in the exported readout matrix.</p>
<p>In the expanded view, Relax layout by connection strength switches to a force-directed layout. It combines repulsion between nodes, attraction based on absolute connection weight and an anchor to the original layout. The resulting coordinates position the nodes on screen. At the default 1.0× speed, 1000 ms of simulated time takes one second to play. Speed ranges from 0.02× to 10×. X/C decreases or increases speed, using steps of 0.02 below 0.1, 0.05 from 0.1 to 0.3, 0.1 from 0.3 to 3, and 1 above 3. Scrub the timeline to compare individual neuronal values at a particular frame.</p>
`,
      compare: String.raw`
<p>After a run completes, use the pin in Traces or Connectivity to save the configuration, network, readout and trajectories as the Reference. Run a modified configuration or change the readout of the existing record, then open Compare. The left panel shows the pinned Reference and the right shows the latest completed Current result. Configuration changes lists the settings and readout IDs that differ.</p>
<p>In Traces you can choose neurons or projected channels separately on either side. Time axes are shared, and the value axes also match when the activity units agree. Connectivity playback covers the duration common to both runs, with each side showing its nearest saved sample. Runs with matching activity units share a color scale. Playback speed applies to both sides; X/C adjusts it using the same piecewise steps as Nodes. Difference computes Stimulus − Baseline within each run.</p>
<p>Neuron and channel IDs belong to their own run. To compare a neuron's responses to two different stimuli, hold the network parameters, Network seed and Noise seed fixed while changing the stimulus. For projected channels, compare the two matrices \(R\) as well. A matching channel number selects the same row number in each run's own matrix.</p>
`,
      exports: String.raw`
<ul>
  <li><strong>Export config / Import config</strong> saves or loads the experiment settings in JSON, including any custom connections, stimulus program and all three random seeds. Importing reruns the experiment. Export reference config in Compare saves the pinned run's settings.</li>
  <li><strong>Export data</strong> writes the complete saved time range for the current result as CSV. Each row contains a time, stimulus commands and activity or voltage in both conditions. LIF also includes counts since the previous saved time. Projected counts are weighted and can be signed.</li>
  <li><strong>Export spikes</strong> is available in Raster for an LIF neuron subset. Each CSV row gives the condition, original neuron ID and spike time in ms at the resolution of the integration grid.</li>
  <li><strong>Export connectivity</strong> in Connectivity saves the full \(J\) after gain is applied. <strong>Export readout matrix</strong> in Recording saves the actual \(R\), with one readout per row and one source neuron per column.</li>
  <li><strong>Export covariance</strong> saves the sample covariance matrix for the selected condition, time interval and estimator. To reproduce a spectrum, also record these analysis settings and the window width. The experiment configuration stores the readout method and seed.</li>
  <li><strong>Download activity GIF</strong> saves an activity animation from Nodes or a side-by-side Connectivity animation from Compare. It plays the full record once at the selected speed. A comparison uses the duration common to both experiments. GIF duration is rounded to 10 ms, with at least 20 ms per frame; this limits very short exports at high speeds.</li>
</ul>
`,
      sources: String.raw`
<ul>
  <li><strong>Rate models and random feedback.</strong> Sompolinsky, Crisanti and Sommers (1988) analyze the large-network dynamics of a rate model with random asymmetric couplings, providing context for Random rate network. <a href="https://doi.org/10.1103/PhysRevLett.61.259" target="_blank" rel="noopener noreferrer"><cite>Chaos in Random Neural Networks</cite></a>.</li>
  <li><strong>Low-rank connectivity.</strong> Mastrogiuseppe and Ostojic (2018) decompose recurrent connectivity into a random component and a low-rank structure. The Low-rank preset uses the symmetric choice of the same left and right vector for each structured term. <a href="https://arxiv.org/abs/1711.09672" target="_blank" rel="noopener noreferrer"><cite>Linking connectivity, dynamics and computations in low-rank recurrent neural networks</cite></a>.</li>
  <li><strong>Spiking neurons and conductances.</strong> Gerstner and colleagues cover integration of membrane voltage, threshold and reset, and the roles of synaptic conductances and reversal potentials. <a href="https://neuronaldynamics.epfl.ch/online/Ch1.S3.html" target="_blank" rel="noopener noreferrer"><cite>Neuronal Dynamics</cite> §1.3</a> and <a href="https://neuronaldynamics.epfl.ch/online/Ch3.S1.html" target="_blank" rel="noopener noreferrer">§3.1</a>.</li>
  <li><strong>Excitatory and inhibitory populations.</strong> Brunel (2000) analyzes population states in sparse E/I spiking networks. The E/I spiking network preset assigns outgoing signs by cell type and uses conductance-based synapses and OU background input. <a href="https://link.springer.com/article/10.1023/A:1008925309027" target="_blank" rel="noopener noreferrer"><cite>Dynamics of Sparsely Connected Networks of Excitatory and Inhibitory Spiking Neurons</cite></a>.</li>
  <li><strong>Stimuli and ongoing activity.</strong> Rajan, Abbott and Sompolinsky (2010) study how external input modifies fluctuations generated by recurrent networks, a context for interpreting the paired response. <a href="https://doi.org/10.1103/PhysRevE.82.011903" target="_blank" rel="noopener noreferrer"><cite>Stimulus-dependent suppression of chaos in recurrent neural networks</cite></a>.</li>
  <li><strong>Readouts, covariance spectra and finite sampling.</strong> Hu and Sompolinsky (2022) study long-window integrated covariance in stable linear networks driven by independent white noise. In the main text, §2.1 Eq. (2) gives zero-frequency covariance, §3.7 covers temporal and spatial sampling, and §5.6 Eq. (37) gives the spike-count window normalization. In the supplement, §H (pp. 26–29) uses independent zero-mean Gaussian time samples. Section I (pp. 30–32) distinguishes coordinate subsampling, random orthogonal projection and Gaussian projection. Eqs. (S104)–(S105) give the participation ratio in the random-compression limit, and Eq. (S107) identifies the post-readout sample ratio \(m/M=f(N/M)\). <a href="https://doi.org/10.1371/journal.pcbi.1010327" target="_blank" rel="noopener noreferrer"><cite>The spectrum of covariance matrices of randomly connected recurrent neuronal networks with linear dynamics</cite></a> and <a href="https://doi.org/10.1371/journal.pcbi.1010327.s001" target="_blank" rel="noopener noreferrer">S1 Text</a>.</li>
  <li><strong>Course and project materials.</strong> The distinction between state and output activity follows Quan Wen's <cite>Attractor Dynamics and Recurrent Networks</cite>, pp. 1–3. His <cite>Geometry of Population Neural Activity and Analysis Methods</cite>, p. 21, motivates the interpretation of participation ratio. Comparing dynamics across conditions draws on the spring course's <cite>Homework 2</cite>. The local notes <cite>Covariance spectra of random recurrent networks: derivations and scope</cite> (§§1 and 5) and <cite>What spectral information survives when only a few neurons are recorded?</cite> develop the discussions of window normalization and partial observation, respectively. <a href="https://github.com/Wenlab/Computation-Neuro-Course/blob/Spring-2026/README.md" target="_blank" rel="noopener noreferrer">Course materials</a>.</li>
</ul>
`
    }
  };

  function manual(language) {
    const chinese = language === "zh";
    const tocTitle = chinese ? "目录" : "Contents";
    const back = chinese ? "返回目录" : "Back to contents";
    const navigation = groups.map(group => {
      const links = group.chapters.map(chapter =>
        `<a href="#theory-${chapter.id}">${chapter[language]}</a>`
      ).join('<span aria-hidden="true"> · </span>');
      return `<p><strong>${group[language]}</strong> ${links}</p>`;
    }).join("\n");
    const sections = groups.map(group => group.chapters.map((chapter, index) => {
      const id = "theory-" + chapter.id;
      const heading = chinese && chapter.id !== "sources" && chapter.id !== "exports"
        ? `${chapter.zh} <span lang="en">· ${chapter.en}</span>` : chapter[language];
      const returnLink = index === group.chapters.length - 1
        ? `<p class="theory-return"><a href="#theory-contents">↑ ${back}</a></p>` : "";
      return `<section aria-labelledby="${id}"><h3 id="${id}" tabindex="-1">${heading}</h3>\n${copy[language][chapter.id]}\n${returnLink}</section>`;
    }).join("\n")).join("\n");
    return `<nav class="theory-toc" aria-labelledby="theory-contents"><h3 id="theory-contents" tabindex="-1">${tocTitle}</h3>\n${navigation}</nav>\n${sections}`;
  }

  globalThis.NeuroTheory = { zh: manual("zh"), en: manual("en") };
})();
