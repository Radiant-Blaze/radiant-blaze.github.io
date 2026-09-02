---
title: Headache
category: Crypto
points: 0
difficulty: 0
flag:
solves:
tags: [crypto, oracle, nonlinear, optimization, scipy]
author: Radiant Blaze
description: Recover the parameters of a nonlinear Hamiltonian oracle using chosen-input queries and nonlinear least-squares optimization.
---
# Headache

## Challenge Overview

The challenge provides a remote **Non-Linear Hamiltonian Authenticator Oracle (H-PRF)**.

The server uses three secret channels. Each channel contains:

- a `4 × 4` coupling matrix `A`
- a `4`-element observable vector `B`

The secrets are regenerated for every round.

We are given an `eval` oracle that evaluates the hidden function on attacker-controlled matrices and a `challenge` command that provides six unknown test sequences.

To authenticate a round, we must submit predictions for those six sequences with an error smaller than:

```text
1e-6
```

There are seven rounds in total.

At first glance this looks like a complicated cryptographic construction. However, the oracle is actually a small differentiable mathematical model with only 60 continuous parameters. This makes it possible to recover the hidden parameters using numerical optimization.

---

# The Oracle

The important part of the challenge is:

```python
def evaluate_ensemble(X, coupling_tensors, observable_vectors):

    X = np.array(X, dtype=np.float64)

    x_tail = X[-1]
    total_energy = 0.0

    for c in range(NUM_CHANNELS):

        microstate_energies = np.einsum(
            'j,jk,ik->i',
            x_tail,
            coupling_tensors[c].T,
            X
        )

        gauge_shift = np.max(microstate_energies)

        boltzmann_weights = np.exp(
            microstate_energies - gauge_shift
        )

        partition_fn = np.sum(boltzmann_weights)

        observables = np.dot(
            X,
            observable_vectors[c]
        )

        ensemble_expectation = (
            np.dot(boltzmann_weights, observables)
            / partition_fn
        )

        total_energy += float(
            ensemble_expectation
        )

    return total_energy
```

For a sequence

```math
X=(x_1,x_2,\ldots,x_n)
```

let the final vector be

```math
t=x_n.
```

For channel `c`, the server computes:

```math
z_i=x_i^T A_c t.
```

These values are converted into softmax probabilities:

```math
p_i= \frac{e^{z_i}} {\sum_j e^{z_j}}.
```

The observable associated with `x_i` is:

```math
v_i=x_i^T B_c.
```

Therefore the contribution of one channel is:

```math
f_c(X)=\sum_i p_i v_i.
```

The final oracle output is:

```math
F(X)= \sum_{c=0}^{2} \sum_i p_i(x_i^TB_c).
```

So despite the fancy terminology, the server is simply evaluating a differentiable nonlinear function.

---

# Recovering the First Secret Information

The first weakness appears when we submit a sequence containing only one vector.

Suppose:

```math
X=[x].
```

There is only one microstate, so its softmax probability is exactly:

```math
p_1=1.
```

The coupling matrix disappears from the result:

```math
F([x]) = x^TB_0+x^TB_1+x^TB_2.
```

Therefore:

```math
F([x]) = x^T(B_0+B_1+B_2).
```

Define:

```math
B_{\text{sum}}=B_0+B_1+B_2.
```

We can recover every coordinate of this vector by querying the four standard basis vectors.

For example:

```text
[1, 0, 0, 0]
[0, 1, 0, 0]
[0, 0, 1, 0]
[0, 0, 0, 1]
```

The resulting four oracle outputs are exactly:

```math
B_{\text{sum},0}, B_{\text{sum},1}, B_{\text{sum},2}, B_{\text{sum},3}.
```

Only four queries are required.

An example from the solve:

```text
Bsum[0] = 2.326915454470
Bsum[1] = 2.913068203874
Bsum[2] = 3.455141027440
Bsum[3] = 2.914002707811
```

---

# Turning the Oracle Into a Regression Problem

The server generates:

```python
coupling_tensors = np.random.uniform(
    0.5, 2.0,
    size=(3, 4, 4)
)

observable_vectors = np.random.uniform(
    0.5, 2.0,
    size=(3, 4)
)
```

Thus there are:

```math
3\times4\times4=48
```

unknown `A` parameters and:

```math
3\times4=12
```

unknown `B` parameters.

Total:

```math
48+12=60.
```

However, we already know:

```math
B_0+B_1+B_2=B_{\text{sum}}.
```

Therefore we don't need to independently recover all three `B` vectors.

We can optimize:

```text
A0 = 16 parameters
A1 = 16 parameters
A2 = 16 parameters

B0 = 4 parameters
B1 = 4 parameters
```

and derive:

```math
B_2=B_{\text{sum}}-B_0-B_1.
```

This reduces the optimization problem from 60 parameters to:

```math
\boxed{56\text{ parameters}}
```

---

# Building the Reduced Model

The solver uses:

```python
def unpack_params(params, Bsum):

    A = params[:48].reshape(3, 4, 4)

    B0 = params[48:52]
    B1 = params[52:56]

    B2 = Bsum - B0 - B1

    B = np.stack([B0, B1, B2])

    return A, B
```

This guarantees that the fitted parameters always satisfy the leaked constraint.

---

# Analytical Jacobian

A major part of making the attack reliable is giving SciPy the analytical Jacobian instead of forcing it to estimate derivatives numerically.

For one channel:

```math
f=\sum_i p_i v_i.
```

For the softmax:

```math
\frac{\partial f}{\partial z_i} = p_i(v_i-f).
```

The solver calculates:

```python
dz = p * (v - fc)
```

Since:

```math
z_i=x_i^TA_ct,
```

the gradient with respect to `A_c` is:

```math
\frac{\partial f}{\partial A_c} = \operatorname{outer} \left( \sum_i p_i(v_i-f)x_i, t \right).
```

In code:

```python
g = dz @ X
dA[c] = np.outer(g, tail)
```

For `B_c`:

```math
\frac{\partial f}{\partial B_c} = \sum_i p_i x_i.
```

which becomes:

```python
gb = p @ X
```

Because `B2` is constrained by:

```math
B_2=B_{\text{sum}}-B_0-B_1,
```

the derivatives with respect to `B0` and `B1` include the contribution from `B2`.

```python
if c == 0:
    dB0 += gb

elif c == 1:
    dB1 += gb

else:
    dB0 -= gb
    dB1 -= gb
```

This gives the optimizer an exact 56-parameter Jacobian.

---

# Collecting Training Data

We generate random sequences with values in the same range as the challenge:

```python
X = np.random.uniform(
    -1.0,
    1.0,
    size=(length, 4)
)
```

We avoid length-one sequences here because they do not contain information about `A`.

The final solver uses only:

```python
TRAINING_QUERIES = 80
```

training queries.

Together with the four basis-vector queries:

```math
80+4=84
```

oracle calls are required per round.

This is far below the server's limit of 1200 queries.

---

# Pipelining the Oracle Queries

The remote server sleeps for 0.03 seconds after every evaluation:

```python
time.sleep(0.03)
```

A naive client would do:

```text
send
wait for response
send
wait for response
...
```

This adds network round-trip overhead to every query.

Instead, the final solver sends all queries in one batch:

```python
buf = bytearray()

for X in seqs:
    buf.extend(
        (
            "eval " +
            json.dumps(
                X,
                separators=(",", ":")
            ) +
            "\n"
        ).encode()
    )

f.write(bytes(buf))
f.flush()
```

The server still processes each command normally, but the client doesn't wait for each individual response before sending the next query.

This significantly improves reliability and speed against the remote service.

It also helped avoid the connection failures encountered with the earlier one-query-at-a-time implementation.

---

# Nonlinear Least Squares

After collecting the training data, we have pairs:

```math
(X_i,y_i)
```

where:

```math
y_i=F(X_i)
```

was obtained from the remote oracle.

We then solve:

```math
\min_\theta \sum_i \left( F(X_i;\theta)-y_i \right)^2.
```

The implementation uses SciPy's `least_squares`:

```python
result = least_squares(
    residual,
    x0,
    jac=jac,
    bounds=(lower, upper),
    method="trf",
    xtol=1e-12,
    ftol=1e-12,
    gtol=1e-12,
    max_nfev=180
)
```

The parameter bounds are known from the challenge:

```math
0.5\leq\theta\leq2.0.
```

This is extremely useful because it prevents the optimizer from wandering into meaningless parameter regions.

---

# Multiple Restarts

Nonlinear optimization is not guaranteed to find the correct solution from every starting point.

The solver therefore performs five random restarts:

```python
MAX_RESTARTS = 5
```

For every restart, the `A` matrices are initialized randomly inside the valid range:

```python
A0 = np.random.uniform(
    0.8,
    1.7,
    size=(3, 4, 4)
)
```

The best solution across all restarts is retained.

Interestingly, some restarts can converge poorly, while another suddenly finds an essentially exact solution.

For example, one successful round produced:

```text
cost=...
maxerr=1.7764e-15
```

which is effectively exact compared with the server's tolerance of:

```text
1e-6
```

---

# Predicting the Challenge

Once the parameters have been recovered, we request:

```text
challenge
```

The server generates six new sequences:

```python
lengths = [3, 5, 7, 9, 13, 17]
```

and sends them to us.

The important part is that the server does not reveal their expected outputs.

However, because we have reconstructed the function, we can evaluate them locally:

```python
for X in sequences:
    y = predict(params, X, Bsum)
    predictions.append(y)
```

We then send:

```text
verify [prediction0, prediction1, ...]
```

The server checks:

```math
\max_i |\hat y_i-y_i| < 10^{-6}.
```

---

# Round-by-Round Attack

The entire process is repeated for every round.

Each round performs:

```text
1. Receive new secret parameters
2. Recover Bsum using 4 queries
3. Generate 80 random training sequences
4. Query the oracle
5. Fit 56 parameters
6. Request challenge
7. Predict six challenge values
8. Submit verify
```

The secrets are regenerated here:

```python
true_A, true_B = init_ensemble()
```

so parameters from one round cannot simply be reused for the next.

---

# Why the Challenge Is Breakable

The fundamental problem is not the mathematical formula itself.

The oracle exposes too much information.

We have:

* arbitrary chosen inputs,
* high-precision floating-point outputs,
* a completely known mathematical model,
* only 60 original parameters,
* known parameter bounds,
* a length-one input that directly leaks `Bsum`,
* no output noise,
* no rounding,
* no cryptographic masking.

This changes the problem from:

> "Break a nonlinear cryptographic authenticator."

into:

> "Identify the parameters of a small differentiable function."

Once viewed this way, nonlinear least-squares optimization becomes a natural attack.

The strongest weaknesses are therefore:

### Length-one input

It eliminates the softmax complexity and directly exposes:

```math
B_0+B_1+B_2.
```

### Exact floating-point oracle

Every query provides a highly precise equation involving the secret parameters.

### Differentiability

The entire function can be differentiated, allowing an analytical Jacobian to be supplied to the optimizer.

### Small parameter space

Only 56 independent parameters remain after exploiting the `Bsum` leak.

### No noise

Even tiny optimization errors can be detected and corrected because the oracle returns precise values.

---

# Final Solver Structure

The final exploit can be summarized as:

```text
                 Remote Oracle
                       |
                       v
             4 basis-vector queries
                       |
                       v
                  Recover Bsum
                       |
                       v
              80 random sequences
                       |
                       v
                Oracle responses
                       |
                       v
             56-parameter model
                       |
                       v
          Analytical Jacobian + bounds
                       |
                       v
          Nonlinear least-squares fit
                       |
                       v
              Recovered parameters
                       |
                       v
                  challenge
                       |
                       v
             6 locally calculated
                 predictions
                       |
                       v
                    verify
                       |
                       v
                Round authenticated
                       |
                       v
                 Repeat × 7
                       |
                       v
                      FLAG
```

# Conclusion

The "Headache" challenge disguises a relatively small system-identification problem behind a nonlinear Hamiltonian model.

The key observation is that a one-element sequence collapses the softmax and reveals the sum of all observable vectors. This removes four degrees of freedom from the original 60-parameter problem.

The remaining 56 parameters can then be recovered using chosen-input oracle evaluations and bounded nonlinear least-squares optimization with an analytical Jacobian.

Only 84 oracle queries per round were required by the final solver, and the recovered model predicted the hidden challenge values with errors around `10^{-14}`, comfortably below the required `10^{-6}`.

## Repeating the process across all seven rounds results in successful authentication and recovery of the flag.

## Exploit Summary

```math
\boxed{ \text{4 queries} \rightarrow B_{\text{sum}} \rightarrow \text{80 training queries} \rightarrow \text{56-parameter fit} \rightarrow \text{challenge prediction} \rightarrow \text{FLAG} }
```
