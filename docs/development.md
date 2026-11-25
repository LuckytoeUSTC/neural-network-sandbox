# 开发与验证

这份文档供修改源码、运行测试或制作离线包时查阅。

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

Dense tanh 的全部轨迹与统计输出逐项一致；后台版模拟期间，16 ms 主线程 heartbeat 的最大间隔为 18.5–21.8 ms。LIF 的计算循环没有这次的 rate-edge 优化，Worker 主要改善其界面响应，不保证更短的求解时间。当时的上限为 96 neurons；当前资源限制见下一节。

Rate model 将连接压成连续数组，减少 RK4 各阶段的边对象解构；当时的优化保持累加顺序、Time step、随机数序列与方程。

## 当前规模与动画（2026-11-21）

最多模拟 1,000 个神经元；协方差与特征值计算最多使用 192 个读出通道。另按连接数、积分工作量、轨迹存储量及投影计算量限制过大的配置，具体阈值集中在 `model.js`。本机 Node 单次试算：1,000 节点 ring 约 0.30 s、1% 密度 random rate 约 1.09 s、1% 密度 LIF 约 0.82 s；这些是模拟耗时，不含浏览器绘图，不能外推到稠密网络。

`layout.js` 在 Worker 中计算带原位置约束的弹簧布局；`gif.js` 在 Worker 中量化和编码 GIF，逐帧接收图像，不保留全部原始帧。矩阵热图先生成像素缓存，悬停时只重绘缓存和选框。播放倍速控件由 `ui.js` 共用。1× 对应模拟时间与现实时间同步；GIF 按记录时长除以倍速确定总时长，采用 10 ms 时间单位及 20 ms 最短帧，累积分配帧延时以避免舍入误差累积。

`node tests/verify-playback-time.cjs` 用受控时钟检查 Nodes 和 Compare 的实际时间映射、暂停续播、动态调速及结束归零。

`node tests/verify-node-tools.cjs` 检查读出错误、倍速及快捷键、布局切换、四种预设的节点间距和两种 GIF 导出。视觉比较与输出文件写入 `.test-output/`。

## 构建离线包

开发需要 Python 3（仅打包），浏览器测试需要 Node.js 和 Playwright：

```sh
npm install
npx playwright install chromium
python tools/build-release.py --mathjax-root /path/to/MathJax
```

MathJax 目录须包含 `local-mathjax.js` 与 `4.1.3/`（SVG renderer、extensions、fonts 和许可证）。首次准备时可从离线发布包的 `vendor/mathjax/` 取得这份固定版本依赖；Windows 共享安装的默认路径为 `D:/MathJax`。输出为 `release/neural-network-sandbox-offline.zip`，含逐文件 SHA-256 清单。测试开发版时将 MathJax 安装到上述共享路径；发布包验收使用 `node tests/verify-release.cjs`，不依赖 D 盘。

项目代码采用 MIT 许可证。离线包中的 MathJax 和字体沿用各自的 Apache-2.0 许可证，原文保存在 `vendor/mathjax/4.1.3/LICENSE` 和 `vendor/mathjax/4.1.3/fonts/mathjax-newcm-font/LICENSE`。本仓库不附带课程讲义、论文 PDF、本机配置或开发历史存档。


## 轻量包与布局缓存（2026-11-21）

`python tools/build-release.py --lite --output release/neural-network-sandbox-lite.zip` 生成不带 MathJax 的离线包；模型说明保留公式源码，不添加联网依赖。`node tests/verify-release.cjs --lite` 验证此包。

Nodes 的概览连接排序及分组按 network 对象缓存，重抽样后自然使用新缓存；WeakMap 不阻止旧网络释放。弹簧布局把固定排斥系数和连接强度归一化移到迭代循环外，方程与迭代次数不变。四种预设的布局结果与整理前一致。

### 发布文件压缩

首次构建运行 `npm ci`。构建脚本批量压缩包内的 JavaScript 和 CSS，保留 `dist/` 的可读源码。Terser 不改写属性名、不启用 unsafe 优化；被序列化到 Worker 的函数只进行词法压缩，保留作用域结构。CSS 使用 clean-css level 0，仅删除注释和多余空白，不重排规则。说明正文、公式、数值精度均保留。压缩工具仅用于构建，不进入网页或下载包。

`node tests/verify-app-equivalence.cjs` 比较源码与压缩版的配置、数据导出、图像像素和页面截图。`NEURO_BASELINE_APP` 可指定重构前的 app.js；Nodes 交互及 GIF 测试支持用 `NEURO_TEST_ENTRY` 指定压缩版入口。
