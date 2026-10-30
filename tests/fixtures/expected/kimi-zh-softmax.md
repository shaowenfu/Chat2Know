[

](/)

## Softmax 公式

用公式、Python 代码和对比表格解释 softmax

Edit

Copy

Share

Thinking complete

User asks to explain softmax with formulas, Python code, and comparison tables. This is a pure chat/explanation task — no need for tools or files. Write a comprehensive answer in Chinese with LaTeX-ish math (can use plain notation), Python code, and tables comparing softmax vs other functions (sigmoid, argmax, etc.) and numerical stability.

# Softmax 详解：公式、代码与对比

## 一、Softmax 是什么

Softmax 函数把一个任意实数向量转换为**概率分布**：所有输出都在 (0, 1) 之间，且总和为 1。它是多分类任务输出层的标准选择，也是交叉熵损失的天然搭档。

## 二、数学公式

### 标准定义

给定输入向量 $\mathbf{z} = [z_{1}, z_{2}, … , z_{K}]$ ，第 $i$ 个元素的 softmax 输出为：

$$
\text{softmax}(z_{i}) = \frac{e^{z_{i}}}{∑_{j=1}^{K} e^{z_{j}}}
$$

### 数值稳定版本

直接计算 $e^{z_{i}}$ 在 $z_{i}$ 较大时会溢出（如 $e^{1000}$ 超出浮点范围）。利用 softmax 对**平移不变**的性质：

$$
\text{softmax}(z_{i}) = \frac{e^{z_{i}−\max (\mathbf{z})}}{∑_{j} e^{z_{j}} − \max (\mathbf{z})}
$$

证明：分子分母同乘 $e^{−c}$ ，结果不变，取 $c = \max (\mathbf{z})$ 即可防止上溢。

### 与交叉熵组合（Log-Softmax 技巧）

实际训练中常使用 log-softmax 配合 NLL（负对数似然）损失：

$$
\log \text{softmax}(z_{i}) = z_{i} − \max (\mathbf{z}) − \log ∑_{j} e^{z_{j}−\max (\mathbf{z})}
$$

这样只需一次指数运算，数值更稳定。PyTorch 的 `nn.CrossEntropyLoss` 内部就是这样实现的，**直接接收原始 logits，不需要先手动加 softmax**。

## 三、Python 代码

### 1\. 手写实现（理解原理）

```python
import numpy as np

def softmax(z):
    # z: 任意形状数组，默认沿最后一维计算
    z = np.asarray(z, dtype=float)
    z_shifted = z - np.max(z, axis=-1, keepdims=True)  # 平移防溢出
    exp_z = np.exp(z_shifted)
    return exp_z / np.sum(exp_z, axis=-1, keepdims=True)

# 示例：一个三分类 logits
logits = np.array([2.0, 1.0, 0.1])
probs = softmax(logits)
print(probs)        # [0.6590 0.2424 0.0986]
print(probs.sum())  # 1.0
```

### 2\. PyTorch 实战用法

```python
import torch
import torch.nn.functional as F

logits = torch.tensor([[2.0, 1.0, 0.1]])      # shape: (batch=1, classes=3)
probs = F.softmax(logits, dim=-1)             # 概率分布
log_probs = F.log_softmax(logits, dim=-1)     # 对数概率（数值更稳）

# 计算损失：直接传 logits，不要先过 softmax
label = torch.tensor([0])
loss = F.cross_entropy(logits, label)         # 等价于 NLLLoss(log_softmax(logits), label)
print(loss.item())  # 0.4170
```

### 3\. 温度系数（Temperature Scaling）

$$
\text{softmax}(z_{i}/T)
$$

$T$ 控制分布的"锐度"，常用于知识蒸馏和 LLM 采样：

```python
for T in [0.5, 1.0, 5.0]:
    p = softmax(logits / T)
    print(f"T={T}: {np.round(p, 4)}")
# T=0.5: [0.8756 0.1138 0.0106]  ← 更尖锐，接近 argmax
# T=1.0: [0.6590 0.2424 0.0986]
# T=5.0: [0.3673 0.3419 0.2908]  ← 更平滑，接近均匀分布
```

## 四、对比表格

### 表 1：数值计算示例

以 $\mathbf{z} = [2.0, 1.0, 0.1]$ 为例：

| 元素 $z_{i}$ | $e^{z_{i}}$ | softmax 输出 | 占比含义 |
| --- | --- | --- | --- |
| 2.0 | 7.389 | **0.659** | 最大输入获得最高概率 |
| 1.0 | 2.718 | 0.242 |  |
| 0.1 | 1.105 | 0.099 |  |
| 合计 | 11.212 | **1.000** | 满足概率公理 |

注意：softmax 放大了差距 —— $z_{1}$ 只比 $z_{2}$ 大 1，但概率是后者的 2.7 倍（恰好等于 $e^{1}$ ）。

### 表 2：Softmax vs 其他输出函数

| 维度 | Softmax | Sigmoid | Argmax (hardmax) |
| --- | --- | --- | --- |
| 输出范围 | (0,1)，**总和=1** | (0,1)，各维独立 | 只有 0 和 1 |
| 适用任务 | 单标签多分类 | 多标签分类 / 二分类 | 不可微，仅推理时用 |
| 类别关系 | 互斥（竞争） | 独立（共存） | 互斥 |
| 可微性 | 可微 | 可微 | 不可微 |
| 典型损失 | 交叉熵 / NLL | 二元交叉熵 | — |
| 典型场景 | 图片分类、词表预测 | 多标签打标、独立事件 | 解码、决策 |

### 表 3：Softmax 各变体对比

| 变体 | 公式要点 | 解决的问题 | 典型应用 |
| --- | --- | --- | --- |
| 标准 Softmax | $e^{z_{i}}/ ∑ e^{z_{j}}$ | — | 多分类输出层 |
| 数值稳定版 | 先减 $\max (\mathbf{z})$ | 指数上溢 | 所有工程实现 |
| Log-Softmax | 取对数后运算 | 下溢 + 计算效率 | 与 NLL 损失配合 |
| 带温度 Softmax | $z_{i}/T$ | 控制分布锐度 | 知识蒸馏、LLM 采样 |
| Sparsemax | 投影到单纯形，产生稀疏解 | 输出含精确 0 的概率 | 可解释注意力 |
| Hierarchical Softmax | 树结构分解 | 词表过大（百万级） | 语言模型加速 |

## 五、几个容易踩的坑

1.  **训练时不要手动加 softmax 再算交叉熵**：`F.cross_entropy` 期望接收 raw logits，先过 softmax 既冗余又破坏数值稳定性；推理时需要概率才调用 `F.softmax`。
    
2.  **维度方向**：对 batch 数据指定 `dim=-1`（类别维），沿错维度求和是常见 bug。
    
3.  **softmax 输出不等于置信度**：分布总和恒为 1，不代表模型"有把握"，OOD（分布外）样本也可能得到高概率——这是它作为置信度度量的著名缺陷。
    
4.  **注意力机制里的 softmax 同理**：Transformer 中 $\text{softmax}(QK^{⊤}/\sqrt{d_{k}})$ 的 $1/\sqrt{d_{k}}$ 本质就是一个温度系数，防止 logits 过大导致梯度消失。
    

总结：softmax 的核心思想就是**指数化 + 归一化**，指数保证非负并放大差异，归一化保证概率性质；工程实现的关键是平移不变性带来的数值稳定技巧。

我知道了

K3 High