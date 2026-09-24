# T–Td (Dew-Point Depression)

T–Td is simply the difference between the current air temperature (**T**) and the dew-point temperature (**Td**):

```text
T–Td = air temperature − dew point
```

If the air temperature is 12.7 °C and the dew point is 10.9 °C:

```text
12.7 − 10.9 = 1.8 °C
```

So the dew-point depression is **1.8 °C**.

It is a very simple number, but it is unusually useful because it answers a very intuitive question:

> **How far is the air from saturation?**

A large spread means the air is relatively far from saturation. A small spread means the air is getting close to saturation.

---

## What temperature, dew point and T–Td each tell you

These three numbers describe different things.

### Air temperature

Air temperature tells you how warm or cold the air is.

That is directly useful on its own.

### Dew point

Dew point tells you about the amount of water vapour actually present in the air.

A higher dew point generally means a moister air mass; a lower dew point means a drier one.

Dew point is therefore not useless on its own, but it does **not** directly tell you how close the current air is to saturation unless you also know the current temperature.

For example:

```text
Temperature: 20 °C
Dew point:   18 °C
```

and:

```text
Temperature: 30 °C
Dew point:   18 °C
```

have the same dew point, so the actual moisture content is similar, but the first air mass is much closer to saturation.

### T–Td

T–Td makes that relationship explicit.

```text
20 − 18 = 2 °C
30 − 18 = 12 °C
```

The first case is close to saturation.

The second is not.

That is the main value of T–Td: it converts two separate readings into a single number that is immediately useful when watching how the atmosphere is changing.

---

## A simple way to read it

There is no universal set of hard thresholds, because local conditions, sensor accuracy and the vertical structure of the atmosphere all matter.

But as a rough observational guide:

| T–Td | Rough interpretation |
| --- | --- |
| **0–2 °C** | Very moist; close to saturation |
| **2–5 °C** | Fairly moist |
| **5–10 °C** | Noticeably drier |
| **10+ °C** | Dry lower air |

The trend is often more interesting than the exact number.

There is also an important asymmetry in the scale:

- **0 °C is the meaningful lower boundary**: temperature and dew point have met, so the air is saturated.
- There is **no practically useful fixed upper boundary** for normal weather. Dew point can fall well below 0 °C, so T–Td can easily exceed the numerical air temperature when both are expressed in Celsius.

For example:

```text
T  = 25 °C
Td =  0 °C
T–Td = 25 °C

T  = 25 °C
Td = -15 °C
T–Td = 40 °C
```

The second example is not paradoxical. Celsius zero is just a reference point; dew point can be negative while the air temperature is positive.

For practical weather watching, the most interesting part of the scale is usually near the bottom. The difference between 1 °C and 3 °C can be much more informative for saturation and low-cloud/fog potential than the difference between 18 °C and 22 °C. Once T–Td is large, the useful message is often simply that the lower air is nowhere near saturation.

For example:

```text
90 minutes ago   7.2 °C
60 minutes ago   5.8 °C
30 minutes ago   4.1 °C
15 minutes ago   2.7 °C
now              1.6 °C
```

That tells a clear story: the surface air has been moving steadily closer to saturation.

On its own, that still does not say "rain is about to start". But combined with radar, cloud movement, wind and a camera view, it becomes very useful supporting evidence.

---

## T–Td is not a rain detector

A low T–Td does **not** mean it must be raining.

Likewise, **T–Td = 0 °C means saturation, not automatically fog**. Fog is one possible outcome when saturation occurs at the surface, but saturated air can also accompany dew, low cloud, drizzle or rain.

If T–Td is close to zero, the air around the sensor is close to saturation. That may accompany:

- rain;
- drizzle;
- mist;
- fog;
- low cloud;
- dew;
- a moist air mass arriving ahead of a weather system.

Equally, precipitation can fall while the surface T–Td is still several degrees above zero.

The atmosphere above the sensor may be much wetter or drier than the air at the surface. Rain can also fall through a dry layer and partially or completely evaporate before reaching the ground.

So T–Td is best treated as **context**, not a yes/no signal.

---

## Watching T–Td together with radar

Radar shows where precipitation echoes are and how they are moving.

T–Td tells you something completely different: what the lower atmosphere at your location is doing.

That makes the combination interesting.

### Example: approaching rain band

Suppose radar shows an area of rain moving toward you while:

```text
T–Td: 6.0 → 4.2 → 2.8 → 1.7 °C
```

At the same time the sky is becoming overcast.

Nothing here guarantees that the rain reaches you, but several independent observations are now pointing in the same direction.

### Example: radar echo approaching through dry air

Suppose instead:

```text
T–Td: 11.0 → 10.4 → 9.8 °C
```

The lower air remains relatively dry.

A light radar echo may weaken or some precipitation may evaporate before reaching the surface. Again, this is not a prediction by itself; it is simply useful evidence when interpreting what the radar is showing.

---

## Watching T–Td together with clouds

Cloud information adds another useful dimension.

Some examples:

### Near-zero T–Td, cloud overhead, no radar echo

This can be consistent with very moist low-level air, mist, fog or low cloud without measurable rain.

### Falling T–Td, thickening cloud, changing wind

This can suggest that a moister air mass or weather boundary is moving in.

### Low T–Td plus widespread cloud and radar echoes

That is a much more complete picture of a moist, precipitation-producing environment.

### Low T–Td but broken cloud and isolated radar echoes

That may fit a showery situation rather than continuous rain.

Cloud products have limitations too, especially when distinguishing low cloud from fog or at night, so the value comes from combining observations rather than treating any one layer as definitive.

---

## A surprisingly useful cloud-base estimate

T–Td can also be used for a rough estimate of the **lifting condensation level** (LCL): the height at which a parcel of surface air would become saturated if it were lifted.

A common rule of thumb is:

```text
Approximate LCL height ≈ T–Td × 125 metres
```

So:

| T–Td | Very rough LCL estimate |
| --- | ---: |
| 1 °C | ~125 m |
| 2 °C | ~250 m |
| 4 °C | ~500 m |
| 6 °C | ~750 m |
| 8 °C | ~1,000 m |
| 10 °C | ~1,250 m |
| 20 °C | ~2,500 m |

This illustrates another useful point: the rule is most intuitive at small-to-moderate spreads. At very large T–Td values the simple surface estimate becomes progressively less representative of the real cloud structure because the atmosphere above you may contain inversions, layers and moisture changes that a single surface measurement cannot see.

This comes from the fact that rising unsaturated air cools faster than its dew point changes, so temperature and dew point gradually converge as the air rises.

It is a **rough surface-based estimate**, not a measurement of the actual cloud base.

Real cloud bases can differ because of:

- temperature inversions;
- layered cloud systems;
- fronts;
- terrain;
- convection;
- moisture changes with height;
- air arriving from somewhere other than directly beneath the cloud.

But when local conditions are reasonably well mixed, it is a fun and surprisingly informative number to watch.

If T–Td falls from 8 °C to 3 °C, the simple estimate moves from roughly 1,000 m to roughly 375 m. Even without treating that as an exact cloud-base measurement, it gives an intuitive sense of how dramatically the lower atmosphere has changed.

---

## Why relative humidity can behave strangely

Relative humidity describes how close the air is to saturation **at its current temperature**.

Because of that, relative humidity can change simply because temperature changes, even when the actual amount of water vapour stays almost the same.

For example, overnight cooling can cause relative humidity to rise sharply without any new moisture being added.

Dew point usually changes much less in that situation.

T–Td makes the same relationship easy to see:

```text
Evening:
T  = 15 °C
Td = 9 °C
T–Td = 6 °C

Later:
T  = 11 °C
Td = 9 °C
T–Td = 2 °C
```

The atmosphere has moved much closer to saturation mainly because the air cooled.

That is exactly the kind of change that can lead to dew, mist or fog.

---

## Dew point and T–Td answer different questions

It is useful to keep both concepts separate:

```text
Dew point  → How much water vapour is in the air?
T–Td       → How far is the air from saturation?
```

Two places can have the same T–Td while containing very different amounts of moisture.

For example:

```text
30 °C / 28 °C → T–Td = 2 °C
10 °C /  8 °C → T–Td = 2 °C
```

Both are close to saturation, but the warm air contains far more water vapour.

So T–Td does not replace dew point. It highlights a different relationship.

---

## Things to look for

T–Td becomes much more fun when you stop looking at it as a static reading and start watching what it does over time.

A few patterns worth watching:

- **Steadily falling T–Td** — lower air is moving toward saturation.
- **Steadily rising T–Td** — air is becoming relatively drier or warming away from its dew point.
- **Near-zero T–Td around sunrise** — worth watching for mist, fog, dew or low cloud.
- **Rapid fall ahead of an approaching radar band** — useful supporting evidence that local conditions are moistening.
- **High T–Td beneath weak approaching echoes** — worth watching whether the precipitation weakens before reaching the ground.
- **Falling T–Td plus lowering-looking cloud on camera** — a satisfying real-world comparison with the rough LCL relationship.
- **T–Td suddenly changes with a wind shift** — potentially a different air mass arriving.

None of these is a guaranteed forecast. That is part of the fun: you are watching actual observations and learning what combinations tend to mean in your own location.

---

## A good way to experiment

Pick a day with changing weather and occasionally note:

```text
Time
T–Td
Radar appearance
Cloud appearance
Wind
What the sky actually looks like
What happens 15–60 minutes later
```

After doing this for a while, patterns become much easier to recognise.

For example, you may notice that a particular kind of light radar echo often disappears before reaching you when T–Td is high, or that rapidly falling T–Td plus a particular cloud pattern regularly precedes drizzle at your location.

Those local observations are often more interesting than memorising generic thresholds.

---

## One final detail: negative T–Td

Under ordinary conditions:

```text
T ≥ Td
```

so T–Td should be zero or positive.

A tiny negative value can appear because of sensor accuracy, rounding, timing differences between temperature and dew-point observations, or a calculated dew point derived from imperfect measurements.

For display purposes, very small negative values can reasonably be treated as approximately zero rather than as a physically meaningful "more than saturated" state.

---

## The useful mental model

If you remember only three things:

```text
Temperature tells you how warm the air is.

Dew point tells you how much moisture is in it.

T–Td tells you how close that air is to saturation.
```

Then watch the **trend**.

A useful mental picture is:

```text
0 °C  ← saturation / most interesting end ─────────→ increasingly dry
```

The scale is not symmetrical. Zero is the meaningful lower edge, while the dry side can extend a long way. For practical nowcasting, most of the interesting behaviour tends to be concentrated in the first few degrees above zero.

That is where T–Td becomes really interesting.
