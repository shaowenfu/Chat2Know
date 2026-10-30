softmax 解释

AI 生成可能有误 请核实

用公式、Python 代码和对比表格解释 softmax

今天 07:14

# Softmax 完整讲解：公式 + Python 代码 + 对比表格

## 一、Softmax 公式

输入向量：$\boldsymbol{z} = [z_1,z_2,...,z_K]$，共 $K$ 个 logits

$\sigma(\boldsymbol{z})_i = \frac{e^{z_i}}{\sum_{j=1}^K e^{z_j}}$

-   输出性质：每个值 $\in(0,1)$，所有输出之和 = 1，可以看作**概率分布**
-   输入是任意实数（正数、负数都可以），输出归一到概率
-   问题：原始直接计算容易**数值溢出**（$e^{大数字}$ 爆炸）
    
    ✅ 稳定版（工程里必用，减去最大值）：

$\sigma(\boldsymbol{z})_i = \frac{e^{z_i - \max(\boldsymbol{z})}}{\sum_{j=1}^K e^{z_j - \max(\boldsymbol{z})}}$

原理：分子分母同除以 $e^{\max(z)}$，分数值不变，抑制指数爆炸。

---

## 二、Python 实现

### 版本 1：朴素实现（容易溢出，仅教学）

```python
import numpy as np

def softmax_naive(z):
    exp_z = np.exp(z)
    return exp_z / np.sum(exp_z)

z = np.array([2.0, 1.0, 0.1])
print("naive softmax:", softmax_naive(z))
```

### 版本 2：数值稳定版本（推荐，等价 torch.softmax）

```python
import numpy as np

def softmax(z):
    z_max = np.max(z)
    exp_z = np.exp(z - z_max)
    return exp_z / np.sum(exp_z)

z = np.array([2.0, 1.0, 0.1])
out = softmax(z)
print("softmax输出：", out)
print("输出总和：", np.sum(out))
```

### 版本 3：PyTorch 内置对照

```python
import torch

z_torch = torch.tensor([2.0, 1.0, 0.1])
sm_torch = torch.softmax(z_torch, dim=0)
print("torch softmax:", sm_torch.numpy())
```

运行输出示例：

plaintext

```plaintext
softmax输出： [0.65900114 0.24243238 0.09856648]
输出总和： 1.0
torch softmax: [0.6590011  0.24243236 0.09856647]
```

### 版本 4：带 batch（多行）softmax

```python
def softmax_batch(z):
    # z shape: [batch, K]
    z_max = np.max(z, axis=1, keepdims=True)
    exp_z = np.exp(z - z_max)
    return exp_z / np.sum(exp_z, axis=1, keepdims=True)

batch_z = np.array([[2,1,0.1], [5,3,1]])
print(softmax_batch(batch_z))
```

---

## 三、对比表格：Softmax vs Sigmoid vs Argmax

表格

| 项目 | Softmax | Sigmoid | Argmax |
| --- | --- | --- | --- |
| 公式 | $\displaystyle \sigma(z_i)=\frac{e^{z_i}}{\sum e^{z_j}}$ | $\displaystyle \sigma(z)=\frac{1}{1+e^{-z}}$ | $\arg\max(\boldsymbol{z})=\text{下标最大值}$ |
| 输出范围 | $(0,1)$ | $(0,1)$ | 类别索引（整数） |
| 和约束 | 全部输出之和 = 1 | 单个独立，和不一定为 1 | 无 |
| 适用场景 | **多分类互斥**（一张图只能是猫 / 狗 / 鸟其中一类） | 二分类 / 多标签（可以同时是猫 + 白色） | 从概率里选出预测类别 |
| 梯度特点 | 相互耦合：一个 logit 变化，所有输出都变 | 每个输出独立，互不影响 | 不可导，不能直接用于训练 |
| 输入 | 一组 logits（K 维向量） | 单个数值 | 一组分数 / 概率 |
| 典型搭配损失 | CrossEntropyLoss（PyTorch：内置 softmax） | BCEWithLogitsLoss | 仅推理阶段用 |

> 重点区分：
> 
> 1.  互斥多分类 → softmax + cross entropy
> 2.  多标签（可以同时多个标签成立）→ sigmoid + BCE

## 四、补充梯度（可选，训练理解用）

设 $p_i = \sigma(z)_i$

$\frac{\partial p_i}{\partial z_j}=
\begin{cases}
p_i(1-p_i) & i=j \\
-p_i p_j & i\neq j
\end{cases}$

👉 这就是 softmax 耦合性来源：改任意一个输入，所有概率都会变动。

## 五、直观例子

输入 logits = `[3, 1, 0]`

-   softmax → \[0.878, 0.118, 0.004\]
-   argmax → 0（选第一个类别）
-   sigmoid 单独算每个：\[0.952, 0.731, 0.5\]，三个之间没关系

如果你想要，我可以再给：**softmax 交叉熵梯度推导**，或者画示意图、做一个可视化 demo。

今天 07:15

我知道了

  

![](//lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/chat/static/image/intro.12b8f8efa8.png)

在此处拖放文件

文件数量：最多 50 个, 文件类型：pdf, txt, csv, docx, doc, xlsx, xls, pptx, ppt, md, mobi, epub

![](//lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/chat/static/image/intro.12b8f8efa8.png)

在此处拖放文件

文件数量：最多 50 个, 文件类型：pdf, txt, csv, docx, doc, xlsx, xls, pptx, ppt, md, mobi, epub