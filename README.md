# 神经网络沙盒

这是一个离线使用的网页，用来模拟各种神经网络。Codex 制作，高度自定义、可视化，也有若干预设模式，可以导出数据和动图；同时，还配备 GPT 生成的双语“理论模型与计算方法说明”（保证触发您的 AI 文本阅读障碍）。如果不需要渲染这份说明中的 MathJax 公式，整个沙盒可以做得超轻量，见[发布页](https://github.com/LuckytoeUSTC/neural-network-sandbox/releases/latest)中的另一个压缩包。轻量版中的公式保留源码显示。

有一些神奇功能，比如 Node Diagram 和 Node Animation，可视化表现各种连接结构，以及对应的神经活动过程（最多支持 1000 个神经元，具体规模还受连接密度和模拟时长等设置影响）；比如看到不同神经网络的连接矩阵长什么样子；比如支持狂点 F5 或 F9 键，反复抽卡，看看能否抽到解决 N-S 方程问题的神经网络（bushi）。

原本是想做个游戏的，根据三个神经元的活动曲线推断神经网络的结构。后来发现 Codex 太蠢，做不出好玩的关卡，于是干脆做一个高度自定义的模拟器，等着娱乐互动“自己从体验中长出来”（模仿 AI 中）。为了把这个工具的各种小 bug 和小细节打磨好，我主动与 GPT-6 Astra 进行若干轮舌战。对 AI 来说，这些交流极具对齐价值；对于我来说，则大幅提升我的情绪唤醒度。双赢。

慢慢走，记得全屏！

## 如何下载使用

到[发布页](https://github.com/LuckytoeUSTC/neural-network-sandbox/releases/latest)下载 ZIP，两个版本都能离线运行：

| 版本 | 下载大小 | 解压后大小 | 区别 |
|---|---:|---:|---|
| [完整版](https://github.com/LuckytoeUSTC/neural-network-sandbox/releases/latest/download/neural-network-sandbox-offline.zip) | 约 4.31 MB | 约 13.34 MB | 包含 MathJax，可以正常显示说明中的公式 |
| [轻量版](https://github.com/LuckytoeUSTC/neural-network-sandbox/releases/latest/download/neural-network-sandbox-lite.zip) | 约 95 KB | 约 257 KB | 不带 MathJax，公式显示为源码；模拟功能相同 |

完整解压后，用 Chrome 或 Edge 打开文件夹里的 `index.html`。不需要安装 Python、Node.js 或其他运行环境。请保留整个文件夹，不要只拿出 HTML 文件。

## AI 参与说明

这个项目主要通过 Codex 开发，代码、界面实现和双语模型说明都大量使用了 AI，模型说明主要由 GPT-6 Astra 协助完成。我负责提出想法、决定功能和交互方式，反复试用，再要求它修改。README 前面的介绍是我写的，下载说明和这一节由 AI 协助整理。
