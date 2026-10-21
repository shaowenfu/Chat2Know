What is scaled dot-product attention?

### Scaled dot-product attention

Attention lets each token weigh every other token. For queries $Q$, keys $K$ and values $V$:

$$
\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
$$

The **scaling factor** keeps the softmax from saturating when *d\_k* is large.

1.  Compute similarity scores.
2.  Normalize them with softmax.
3.  Take a weighted sum of values.

```python
def attention(q, k, v):
    scores = q @ k.T / math.sqrt(k.shape[-1])
    return softmax(scores) @ v
```

| Variant | Complexity | Notes |
| --- | --- | --- |
| Full attention | $O(n^2)$ | Exact |
| Linear attention | $O(n)$ | Approximate \| kernel trick |

In short: attention is a learned, content-based lookup.