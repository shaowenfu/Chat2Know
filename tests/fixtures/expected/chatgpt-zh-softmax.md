[Skip to content](#_r_0_)

[Skip to content](#_r_hp_)

Loading older messages…

#### You said:You

用一个具体的例子，详细串联一遍这条流程的完整推导

#### ChatGPT said:ChatGPT

#### You said:You

一般情况下怎么计算行列式来着，怎么计算矩阵的逆来着。对角化是针对谁说的，什么时候矩阵能对角化，特征向量是重根是什么意思，特征重数、几何重数这些是什么，跟对角化有什么关系，

#### ChatGPT said:ChatGPT

#### You said:You

高斯–若尔当消元法的规则有哪些？什么是多元函数值，什么是多元向量值函数，什么是雅可比矩阵

#### ChatGPT said:ChatGPT

#### You said:You

![User attachment](blob:https://chatgpt.com/d6ce8dc0-e2f7-4863-a46d-5256dd844570)

![User attachment](blob:https://chatgpt.com/95680d6f-bb9f-403a-8e38-ac521c9992f0)

![User attachment](blob:https://chatgpt.com/03ae613f-d1a9-42e5-bdca-20eeebfcd234)

解释老师的板书

#### ChatGPT said:ChatGPT

#### You said:You

![User attachment](blob:https://chatgpt.com/12e6f822-5305-4bcc-931d-45f5d9e686b2)

我怎么完全看不懂 PPT 上写的呢

#### ChatGPT said:ChatGPT

#### Latest response

我还是不懂

To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel.

#### You said:You

用公式、Python 代码和对比表格解释 softmax

#### ChatGPT said:ChatGPT

# Softmax：从任意实数到概率分布

Softmax 是机器学习中最常见的激活函数之一，广泛应用于**多分类任务、神经网络输出层和 Transformer 的 Attention 机制**。

它的核心作用是：

> 将一组任意实数转换成一个概率分布，使所有输出都在 $(0,1)$ 之间，并且总和为 1。

## 一、数学定义

假设神经网络输出一个向量：

$$
\mathbf{z}=[z_1,z_2,\ldots,z_n]
$$

Softmax 对第 $i$ 个元素的计算公式为：

$$
\boxed{
\operatorname{Softmax}(z_i)=
\frac{e^{z_i}}{\sum_{j=1}^{n}e^{z_j}}
}
$$

其中：

-   $z_i$：第 $i$ 个原始分数，也叫 Logit。
-   $e^{z_i}$：对分数进行指数变换。
-   $\sum_j e^{z_j}$：归一化因子，保证概率之和为 1。

### 为什么使用指数函数？

指数函数具有两个重要性质：

**1\. 保证输出为正数**

$$
e^x>0,\quad \forall x\in\mathbb{R}
$$

**2\. 放大不同分数之间的差异**

例如：

| 输入 $x$ | 指数变换 $e^x$ |
| --- | --- |
| \-2 | 0.135 |
| \-1 | 0.368 |
| 0 | 1.000 |
| 1 | 2.718 |
| 2 | 7.389 |
| 3 | 20.086 |

可以发现，随着输入增大，指数函数增长越来越快。

因此，Softmax 不仅将数值转换为概率，还会突出较大的输入。

---

## 二、手动计算示例

假设一个图像分类模型需要判断图片属于哪一类。

模型输出：

$$
\mathbf{z}=[2,1,0.1]
$$

分别代表猫、狗、鸟的原始分数。

**第一步：指数变换**

$$
e^2=7.389
$$

$$
e^1=2.718
$$

$$
e^{0.1}=1.105
$$

**第二步：计算归一化因子**

$$
Z=7.389+2.718+1.105=11.212
$$

**第三步：计算概率**

$$
P(\text{猫})=\frac{7.389}{11.212}=0.659
$$

$$
P(\text{狗})=\frac{2.718}{11.212}=0.242
$$

$$
P(\text{鸟})=\frac{1.105}{11.212}=0.099
$$

最终：

$$
\boxed{
\operatorname{Softmax}([2,1,0.1])
\approx[0.659,0.242,0.099]
}
$$

| 类别 | 原始 Logit | Softmax 概率 |
| --- | --- | --- |
| 猫 | 2.0 | 65.9% |
| 狗 | 1.0 | 24.2% |
| 鸟 | 0.1 | 9.9% |
| **总计** | — | **100%** |

注意：Softmax 输出的是模型定义的概率分布，并不意味着模型预测的真实正确率一定是 65.9%。概率是否可靠还取决于模型的校准程度。

---

## 三、Python 实现

### 1\. 使用 NumPy

```python
import numpy as np

def softmax(x):
    exp_x = np.exp(x - np.max(x))
    return exp_x / np.sum(exp_x)

logits = np.array([2.0, 1.0, 0.1])

probs = softmax(logits)

print(probs)
print(probs.sum())
```

输出：

```
[0.65900114 0.24243297 0.09856589]
1.0
```

这里有一个值得注意的细节：

```python
exp_x = np.exp(x - np.max(x))
```

为什么要减去最大值？

因为指数函数增长很快，当输入过大时：

$$
e^{1000}\rightarrow\text{数值溢出}
$$

但 Softmax 具有**平移不变性**：

$$
\operatorname{Softmax}(\mathbf z)
=
\operatorname{Softmax}(\mathbf z+c)
$$

证明：

$$
\frac{e^{z_i+c}}{\sum_j e^{z_j+c}}
=
\frac{e^c e^{z_i}}{e^c\sum_j e^{z_j}}
=
\frac{e^{z_i}}{\sum_j e^{z_j}}
$$

因此，减去最大值不会改变结果，却能显著提高数值稳定性。

### 2\. 使用 PyTorch

实际训练神经网络时，通常直接调用：

```python
import torch
import torch.nn.functional as F

logits = torch.tensor([2.0, 1.0, 0.1])

probs = F.softmax(logits, dim=0)

print(probs)
```

输出：

```
tensor([0.6590, 0.2424, 0.0986])
```

对于批量输入：

```python
logits = torch.tensor([
    [2.0, 1.0, 0.1],
    [0.5, 3.0, 1.0]
])

probs = F.softmax(logits, dim=1)

print(probs)
```

这里 dim=1 表示沿着类别维度计算 Softmax，即每一行分别归一化。

---

## 四、Softmax、Sigmoid、ReLU 对比

这三个函数都经常出现在神经网络中，但用途不同。

| 特性 | Softmax | Sigmoid | ReLU |
| --- | --- | --- | --- |
| 数学公式 | $\frac{e^{z_i}}{\sum_j e^{z_j}}$ | $\frac{1}{1+e^{-x}}$ | $\max(0,x)$ |
| 输入 | 向量 | 标量（逐元素） | 标量（逐元素） |
| 输出范围 | $(0,1)$ | $(0,1)$ | $[0,+\infty)$ |
| 输出总和为 1 | 是 | 否 | 否 |
| 元素之间相互影响 | 是 | 否 | 否 |
| 典型用途 | 多分类、Attention | 二分类、多标签分类 | 隐藏层激活 |

### 最关键的区别：Softmax 存在竞争关系

假设三个类别的分数为：

$$
[2,1,0]
$$

Softmax 输出：

$$
[0.665,0.245,0.090]
$$

如果第一个类别的分数增加：

$$
[4,1,0]
$$

Softmax 输出：

$$
[0.936,0.047,0.017]
$$

可以发现：

**即使第二、第三个类别的分数没有变化，它们的概率仍然下降。**

这是因为所有元素共享同一个分母。

而 Sigmoid 是逐元素独立计算的：

$$
\sigma(z_i)=\frac{1}{1+e^{-z_i}}
$$

一个元素发生变化，不会影响其他元素的输出。

因此：

-   **Softmax**：适用于互斥类别，例如一张图片只能被分类为猫、狗、鸟中的一个。
-   **Sigmoid**：适用于多个标签可以同时成立的情况，例如图片中同时存在猫和狗。

---

## 五、温度参数 Temperature

Softmax 还有一个重要变体：

$$
\boxed{
P_i=\frac{e^{z_i/T}}{\sum_j e^{z_j/T}}
}
$$

其中 $T>0$ 称为温度参数。

它决定概率分布的尖锐程度。

以输入：

$$
\mathbf z=[2,1,0.1]
$$

为例：

| 温度 $T$ | 类别1 | 类别2 | 类别3 | 分布特点 |
| --- | --- | --- | --- | --- |
| 0.5 | 86.4% | 11.7% | 1.9% | 非常集中 |
| 1.0 | 65.9% | 24.2% | 9.9% | 标准 Softmax |
| 2.0 | 50.2% | 30.4% | 19.4% | 更加均匀 |
| $T\to0^+$ | 100% | 0% | 0% | 趋近最大值选择 |
| $T\to\infty$ | 33.3% | 33.3% | 33.3% | 趋近均匀分布 |

对应的 Python 代码：

```python
import numpy as np

def softmax(x, temperature=1.0):
    x = np.asarray(x, dtype=float) / temperature
    exp_x = np.exp(x - np.max(x))
    return exp_x / np.sum(exp_x)

logits = [2.0, 1.0, 0.1]

for T in [0.5, 1.0, 2.0]:
    print(f"T={T}: {softmax(logits, T)}")
```

温度越低，分布越集中；温度越高，分布越平坦。

这也是大语言模型采样中 Temperature 参数的数学基础之一。

---

## 六、Softmax 在 Transformer 中的作用

Transformer 中的 Scaled Dot-Product Attention 定义为：

$$
\boxed{
\operatorname{Attention}(Q,K,V)
=
\operatorname{Softmax}
\left(
\frac{QK^T}{\sqrt{d_k}}
\right)V
}
$$

可以拆解为三个步骤。

**第一步：计算注意力分数**

$$
S=\frac{QK^T}{\sqrt{d_k}}
$$

这里计算的是 Query 与 Key 之间的匹配程度。

**第二步：通过 Softmax 生成注意力权重**

$$
A=\operatorname{Softmax}(S)
$$

Softmax 通常沿 Key 的维度计算，使每个 Query 对所有可见 Key 的注意力权重之和为 1。

**第三步：加权求和**

$$
O=AV
$$

即根据注意力权重，对 Value 进行加权求和。

例如：

$$
A=[0.7,0.2,0.1]
$$

意味着当前 Query 对三个 Value 的权重分别为 70%、20%、10%。

对应 Python 代码：

```python
import torch
import torch.nn.functional as F
import math

Q = torch.randn(3, 4)
K = torch.randn(3, 4)
V = torch.randn(3, 4)

# 计算注意力分数
scores = Q @ K.T / math.sqrt(4)

# Softmax 归一化
weights = F.softmax(scores, dim=-1)

# 对 Value 加权求和
output = weights @ V

print("Attention Weights:")
print(weights)

print("Output:")
print(output)
```

这里的 Softmax 本质上将 Query 与不同 Key 的匹配分数转换为一组相对权重。

---

## 七、Softmax 的梯度

最后从反向传播角度理解 Softmax。

定义：

$$
p_i=\frac{e^{z_i}}{\sum_k e^{z_k}}
$$

对 $z_j$ 求偏导：

$$
\boxed{
\frac{\partial p_i}{\partial z_j}
=
p_i(\delta_{ij}-p_j)
}
$$

其中 $\delta_{ij}$ 是 Kronecker Delta：

$$
\delta_{ij}=
\begin{cases}
1&i=j\\
0&i\neq j
\end{cases}
$$

因此分为两种情况。

**1\. 对自身求导**

$$
\frac{\partial p_i}{\partial z_i}
=p_i(1-p_i)
$$

结果为正，说明增加自身 Logit 会提高自身概率。

**2\. 对其他元素求导**

$$
\frac{\partial p_i}{\partial z_j}
=-p_ip_j,\quad i\neq j
$$

结果为负，说明增加其他类别的 Logit 会降低当前类别的概率。

这再次说明 Softmax 的各个输出之间存在竞争关系。

写成矩阵形式，就是 Softmax 的 Jacobian：

$$
\boxed{
J=\operatorname{diag}(\mathbf p)-\mathbf p\mathbf p^T
}
$$

在多分类神经网络中，如果将 Softmax 与交叉熵损失函数结合：

$$
L=-\sum_i y_i\log p_i
$$

其中 $\mathbf y$ 是概率和为 1 的目标标签分布，则可以推导出一个非常简洁的结果：

$$
\boxed{
\frac{\partial L}{\partial z_i}=p_i-y_i
}
$$

也就是说：

**Softmax + Cross Entropy 的反向传播梯度，最终就是预测概率减去真实标签。**

这也是实际训练分类神经网络时，通常将 Softmax 和交叉熵结合使用的重要原因。

在 PyTorch 中，\`F.cross\_entropy()\` 已经将 LogSoftmax 和负对数似然损失进行了数值稳定的组合，因此训练时应直接传入原始 Logits，而不是先手动计算 Softmax。

---

### 总结

Softmax 的本质可以归纳为三个数学性质：

1.  **指数变换**：将任意实数映射为正数，并突出较大的输入。
2.  **归一化**：使所有输出之和等于 1，形成概率分布。
3.  **相互竞争**：一个元素的概率不仅取决于自身，还取决于其他所有元素。

最值得记住的三个公式是：

$$
\boxed{
p_i=\frac{e^{z_i}}{\sum_j e^{z_j}}
}
$$

$$
\boxed{
\frac{\partial p_i}{\partial z_j}
=p_i(\delta_{ij}-p_j)
}
$$

$$
\boxed{
\frac{\partial L}{\partial z_i}=p_i-y_i
}
$$

分别对应 **前向传播、Softmax 的 Jacobian，以及与交叉熵结合后的反向传播**。

#### Latest response

  

To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel.

To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel.

Response complete

## 解释 Softmax