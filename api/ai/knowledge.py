"""Curated domain-knowledge base for the Ask assistant.

These are short, plain-language explanations of the METHODS the app uses —
distilled from the project's reading (the ED-arrivals forecasting literature,
Simchi-Levi et al. "Designing and Managing the Supply Chain", and the Industrial
Statistics course text) and written in the team's own words so the assistant can
explain the analysis deeply but simply, and cite where each idea comes from.

This is NOT a verbatim copy of any textbook — it is a teaching summary. Retrieval
is a simple keyword match (no embeddings needed); the assistant calls the
`lookup_knowledge` tool and gets the best-matching card(s)."""
from __future__ import annotations

# Each card: id -> {title, keywords, source, body}
CARDS: dict[str, dict] = {
    "why_forecast_ed": {
        "title": "Why forecast ED arrivals at all",
        "keywords": "forecast why purpose arrivals demand emergency department ed planning point of everything",
        "source": "ED demand-forecasting literature (the project's reading folder)",
        "body": (
            "An emergency department cannot turn patients away, so the only lever managers "
            "have is to prepare for how many will come. A good day-ahead and week-ahead "
            "forecast lets you roster the right number of nurses and order the right amount "
            "of stock BEFORE the demand arrives, instead of reacting once people are already "
            "waiting. Every other number in this app — the staff roster, the reorder plan, "
            "the action list — is downstream of the arrivals forecast."
        ),
    },
    "sarimax": {
        "title": "The best statistical model",
        "keywords": "statistical model best stat classical time series baseline trend seasonality rhythm forecast forecasting sarimax",
        "source": "classical time-series methods (Industrial Statistics)",
        "body": (
            "The statistical model is a classic time-series approach. It reads three things from "
            "the past: the trend (is the level drifting up or down), the weekly rhythm (Mondays "
            "look like Mondays), and short-term momentum (yesterday nudges today). It is "
            "transparent and a dependable baseline, but it mainly captures the calendar pattern "
            "and can't blend many signals in complicated ways. In this app it's the 'best "
            "statistical model' choice on the forecast pages."
        ),
    },
    "gradient_boosting": {
        "title": "The best ML model",
        "keywords": "machine learning ml model best engine accurate patterns features lags weather calendar smart forecast forecasting predict",
        "source": "ED machine-learning forecasting literature (the project's reading folder)",
        "body": (
            "The ML model learns from many examples at once. It builds lots of small pattern-"
            "learners, each one correcting the last, until together they capture rich, non-linear "
            "behaviour. It can blend dozens of clues — recent arrivals, the day of week, the "
            "month, weekends and weather — which is why it usually tracks ED demand best. In this "
            "app it's the 'best ML model' choice. (The exact algorithm and its validation figures "
            "are kept for the technical/admin view, not the public app.)"
        ),
    },
    "multistep": {
        "title": "Forecasting several days ahead: recursive vs direct",
        "keywords": "multi-step multistep recursive direct horizon seven days h ahead strategy error propagation",
        "source": "multi-step forecasting literature (Ben Taieb; Bontempi)",
        "body": (
            "To forecast a whole week you can work two ways. RECURSIVE: fit one model for "
            "'tomorrow', then feed its own prediction back in as yesterday's value to step to "
            "the next day, and so on. Simple, but small errors can snowball further out. DIRECT: "
            "fit a separate model for each day of the horizon, so nothing is fed back. This app "
            "(and the thesis) use the recursive strategy. Interestingly, day-7 is often EASIER "
            "than day-1 here, because day-7 lands on the same weekday a week later — the strongest "
            "seasonal signal in the data."
        ),
    },
    "accuracy": {
        "title": "How reliable the forecast is",
        "keywords": "accuracy reliable trust how good confidence reliability error problem wrong validated likely range",
        "source": "model validation practice (Industrial Statistics)",
        "body": (
            "The forecast is validated — it has been checked against real history before going "
            "live — and is reliable enough to plan rosters and orders around. Rather than fixate "
            "on a single accuracy score, plan with each day's 'likely range': the band the real "
            "number should usually fall inside. The detailed accuracy statistics are kept for the "
            "technical/admin view, not the public app. If a prediction ever looks clearly wrong, "
            "the right step is to contact the platform administrator, who manages the models and "
            "data. (Do not quote a specific accuracy percentage to users.)"
        ),
    },
    "backtest": {
        "title": "Backtesting — checking a forecast against reality",
        "keywords": "backtest backtesting validation test past date proven trust check against real",
        "source": "model validation practice (Industrial Statistics)",
        "body": (
            "A forecast is only believable if it has been checked on data it never saw. "
            "Backtesting picks a past date, trains the model on everything BEFORE it, predicts "
            "forward, and compares to what actually happened. The accuracy you see is then "
            "measured, not promised. On the Total ED page you can switch to 'Backtest a past "
            "date' to do exactly this."
        ),
    },
    "inventory_ss": {
        "title": "The (s, S) reorder policy",
        "keywords": "inventory supply reorder s S policy stock order up to level when how much replenishment",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "(s, S) is a simple, well-proven stock rule. 's' is the reorder point: when stock "
            "on hand drops to s, you place an order. 'S' is the order-up-to level: you order "
            "enough to bring stock back up to S. So you order infrequently but in sensible "
            "batches. The whole supply optimization in this app is choosing the best s and S "
            "for each item from next week's forecast."
        ),
    },
    "safety_stock": {
        "title": "Safety stock and service level",
        "keywords": "safety stock service level z sigma lead time buffer uncertainty stockout protect 95 percent",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "Demand during the delivery wait (the lead time L) is uncertain, so you hold a "
            "buffer on top of average need: safety stock = z x sigma x sqrt(L). 'sigma' is how "
            "bumpy demand is, 'L' the lead time, and 'z' is set by the service level you want "
            "(z = 1.65 for 95%). A higher service level means a bigger z, more buffer, fewer "
            "stockouts — but more cash tied up. A BETTER forecast shrinks sigma, so you reach "
            "the same service level with less stock: that is the dividend of forecasting."
        ),
    },
    "inventory_costs": {
        "title": "The four inventory costs the optimizer balances",
        "keywords": "cost ordering holding stockout wastage expiry trade off total minimize monte carlo expected",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "Every stock policy trades off four costs: ORDERING (a fixed fee each time you place "
            "an order), HOLDING (cash and space tied up in stock you're keeping), STOCKOUT (the "
            "penalty when you run out and can't treat), and WASTAGE (items that expire unused). "
            "Order too little and stockout cost explodes; order too much and holding plus wastage "
            "climb. The supply optimizer simulates next week's demand many times (a Monte-Carlo "
            "run) and picks the order-up-to level S with the lowest EXPECTED total of these four."
        ),
    },
    "monte_carlo": {
        "title": "Monte-Carlo simulation",
        "keywords": "monte carlo simulation random reps expected average uncertainty thousand runs replications stochastic",
        "source": "stochastic methods (Industrial Statistics)",
        "body": (
            "When the future is uncertain, you don't guess one number — you play the week "
            "forward hundreds of times with demand drawn randomly around the forecast, and "
            "average the result. That average is the 'expected' cost or coverage, and it is far "
            "more honest than a single best-guess run. The supply optimizer does this (about 800 "
            "simulated demand paths over a 90-day horizon) to score each candidate stock level."
        ),
    },
    "workforce_ip": {
        "title": "The staff roster as an optimization problem",
        "keywords": "staff roster workforce integer programming optimization nurse schedule coverage constraints cost minimize lawful",
        "source": "operations-research scheduling; BCEA labour law",
        "body": (
            "Building the cheapest lawful roster is an integer programme: decide yes/no whether "
            "each nurse works each shift, to MINIMISE total cost while MEETING every shift's "
            "demand and OBEYING the rules — the 45-hour weekly cap and 11-hour rest from the "
            "Basic Conditions of Employment Act, one shift per nurse per day, and a skills mix. "
            "Demand per shift comes from the forecast. When the lawful staff can't cover demand, "
            "the gap shows as agency-locum hours rather than illegal overtime — which is the real "
            "South African public-hospital staffing story."
        ),
    },
    "forecast_to_ops": {
        "title": "How the forecast becomes a staffing and supply plan",
        "keywords": "connect chain forecast drives staffing supply optimization pipeline how everything links downstream",
        "source": "the project's methodology (Chapter 3)",
        "body": (
            "Everything is one chain. The model forecasts daily arrivals; that daily number is "
            "split across Day/Evening/Night shifts and divided by the nurse-to-patient ratio to "
            "get how many nurses each shift needs (the staff optimizer's demand). The same "
            "forecast scales each item's expected consumption (the supply optimizer's demand). "
            "So a more accurate forecast directly produces a leaner roster and less safety stock "
            "— you can see this on the Optimization page by comparing the two forecast engines."
        ),
    },

    # --- Industrial-statistics cards (course text: Industrial Statistics; REA
    # Statistics Super Review). Written for interpreting live scenarios. -------
    "common_special_cause": {
        "title": "Is this spike real? Common cause vs special cause",
        "keywords": "spike unusual normal noise variation control chart shewhart special cause common cause signal outlier real change shift abnormal weird high low today",
        "source": "Industrial Statistics (control charts, Shewhart)",
        "body": (
            "Every process wobbles. COMMON-CAUSE variation is the everyday wobble — a busy "
            "Tuesday, a quiet Sunday — and reacting to each wobble makes things worse, not "
            "better. SPECIAL-CAUSE variation is a genuine change in the system — a new clinic "
            "closing nearby, a flu wave, a regime shift like COVID. The practical test: one day "
            "inside the forecast's likely range is common cause (leave it alone); a run of days "
            "hugging one side of the forecast, or a point far outside the range, signals a real "
            "shift worth investigating. When interpreting any 'why was yesterday so high?' "
            "question, first ask which kind of variation it is before proposing action."
        ),
    },
    "variability_planning": {
        "title": "Averages lie: plan with spread, not just the mean",
        "keywords": "average mean median standard deviation spread swing variability range typical day volatile stable why range wide flaw of averages",
        "source": "Statistics Super Review (measures of variability); Industrial Statistics",
        "body": (
            "Two wards can both average 60 patients a day — one swinging 40 to 85, the other "
            "steady at 55 to 65 — and they need completely different staffing. The mean tells "
            "you the level; the STANDARD DEVIATION tells you the swing, and planning lives in "
            "the swing. That is why every forecast here carries a likely range, and why safety "
            "stock and rosters are sized from variability, not averages. If someone plans to "
            "the average, they are understaffed roughly half of all days by construction — "
            "the classic 'flaw of averages'."
        ),
    },
    "distributions_counts": {
        "title": "Which randomness: normal, Poisson, or overdispersed counts",
        "keywords": "distribution normal bell curve poisson binomial negative binomial overdispersion counts random arrival pattern shape tail",
        "source": "Industrial Statistics (probability distributions)",
        "body": (
            "Arrivals are COUNTS, and counts have their own arithmetic. A Poisson process is "
            "the textbook model for independent arrivals — its variance equals its mean. Real "
            "ED data is bumpier than that (epidemics, paydays, weather cluster the arrivals), "
            "so variance exceeds the mean: OVERDISPERSION. That is why this app's simulations "
            "draw demand from a negative-binomial distribution rather than Poisson — using "
            "Poisson would understate the bad days and quietly undersize both the roster and "
            "the safety stock. The bell-curve (normal) shows up separately: as the shape of "
            "forecast errors, which is what the likely ranges are built from."
        ),
    },
    "confidence_intervals": {
        "title": "Confidence intervals and 'is the difference real?'",
        "keywords": "confidence interval ci 95 significant significance real difference noise sample uncertainty error bars plus minus",
        "source": "Industrial Statistics (tests and confidence intervals)",
        "body": (
            "A 95% confidence interval says: measured this way many times, about 19 in 20 "
            "intervals would contain the true value. In this app the simulation KPIs carry "
            "intervals (e.g. coverage 97.3%, CI 96.8-97.8) — read the WIDTH as honesty about "
            "sampling noise. When comparing two numbers (two policies, weekend vs weekday), "
            "the quick test is whether their intervals clearly separate. And keep statistical "
            "vs practical significance apart: a difference can be real yet too small to act "
            "on, and a big-looking difference can be noise if the intervals overlap."
        ),
    },
    "correlation_regression": {
        "title": "Correlation, regression, and the causation trap",
        "keywords": "correlation regression relationship weather temperature effect driver cause causation predict variable slope",
        "source": "Industrial Statistics (prediction from other variables)",
        "body": (
            "Regression measures how one thing moves with another — 'each 5 degrees colder "
            "adds roughly N respiratory arrivals'. Two cautions when interpreting. First, "
            "CORRELATION IS NOT CAUSATION: hot days and trauma arrivals may both follow from "
            "weekends and paydays rather than each other. Second, a relationship measured "
            "inside one range may not hold outside it (extrapolation). The app's weather and "
            "calendar effects are correlations chosen because they are also plausible "
            "mechanisms and are known in advance — which is what makes them safe forecast "
            "features."
        ),
    },
    "autocorrelation": {
        "title": "Autocorrelation — why yesterday predicts today",
        "keywords": "autocorrelation ar arima momentum yesterday lag memory persistence time series stationarity differencing pattern week",
        "source": "Industrial Statistics (time series, AR/ARIMA)",
        "body": (
            "Time series have memory: a busy day tends to follow a busy day (momentum), and "
            "this Monday resembles last Monday (weekly autocorrelation). Forecasting works "
            "precisely because that memory exists — the statistical engine models it directly "
            "(the ARIMA family), the ML engine feeds it in as lag features. STATIONARITY "
            "means the series' behaviour is stable enough to learn from; trends are removed "
            "by differencing (modelling day-to-day changes). When a user asks 'how can you "
            "predict people?', this is the honest answer: individuals are unpredictable, but "
            "the rhythm of the crowd is strongly patterned."
        ),
    },
    "pareto_abc": {
        "title": "The Pareto principle and ABC focus",
        "keywords": "pareto 80 20 abc class vital few priority focus which items matter most ranking important",
        "source": "Industrial Statistics (Pareto charts); Simchi-Levi (ABC classification)",
        "body": (
            "In almost every operation a vital few drive most of the effect: a few items carry "
            "most of the spend, a few weekdays carry most of the overload. A Pareto view ranks "
            "contributors so attention lands where it pays. The supply module's ABC classes "
            "are exactly this: A-items (few, high-value, critical) get tight service levels "
            "and daily attention; C-items get simple rules. When interpreting any 'what should "
            "we fix first?' scenario, rank by impact before proposing an even spread of effort."
        ),
    },
    "fair_comparison": {
        "title": "Comparing policies fairly — the experiment behind the ladders",
        "keywords": "compare comparison fair experiment anova strategies policies ladder same conditions paired luck which better test",
        "source": "Industrial Statistics (experimental design); simulation practice",
        "body": (
            "You cannot judge two policies by running each in a different random week — the "
            "luck of the draw contaminates the verdict. The fix is a designed comparison: run "
            "every candidate policy against the SAME simulated demand streams (common random "
            "numbers — the simulation cousin of paired experiments), and repeat across many "
            "streams so averages stabilise. That is how the app's six-policy supply ladder and "
            "six-strategy staffing comparison are computed, which is why their rankings are "
            "trustworthy rather than one lucky run."
        ),
    },
    "pdsa_improvement": {
        "title": "PDSA — how a hospital should adopt these numbers",
        "keywords": "pdsa plan do study act improvement cycle adopt rollout shadow trust process change deming shewhart",
        "source": "Industrial Statistics (the Shewhart cycle)",
        "body": (
            "Quality improvement is a loop, not a leap: PLAN (state what you expect — e.g. "
            "'the forecast-driven roster will cut locum hours 15%'), DO (try it small, ideally "
            "in shadow mode alongside current practice), STUDY (compare what happened against "
            "the prediction — the app's backtests are exactly this step), ACT (adopt, adjust, "
            "or abandon — then loop). When advising a manager on rolling out any change this "
            "app recommends, frame it as a PDSA cycle: it converts scepticism into a fair "
            "test instead of an argument."
        ),
    },

    # --- Supply-chain cards (Simchi-Levi, Designing and Managing the Supply
    # Chain, 3e — distilled). --------------------------------------------------
    "bullwhip": {
        "title": "The bullwhip effect — why order swings exceed demand swings",
        "keywords": "bullwhip amplification orders swing upstream variability batching panic ordering supplier whiplash why orders lumpy",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "Order patterns get wilder as you move up a supply chain even when patient demand "
            "is steady. Four engines drive it: reacting to every demand wobble by re-forecasting "
            "(chasing noise), batching orders into big lumps, price-driven bulk buying, and "
            "shortage gaming (over-ordering when supply feels scarce, then cancelling). The "
            "damage is excess stock AND stockouts at the same time. The antidote is exactly "
            "what this app implements: order from a shared, stable FORECAST with a policy "
            "(s, S), not from last week's panic. When a user asks why the storeroom lurches "
            "between overflowing and empty, bullwhip is usually the story to tell."
        ),
    },
    "risk_pooling": {
        "title": "Risk pooling — why totals are tamer than parts",
        "keywords": "risk pooling aggregation total specialty combine centralize variability smoother stable why total forecast better accurate",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "Add independent random demands together and their swings partially cancel: the "
            "total is proportionally steadier than any part. Two consequences in this app. "
            "Forecasting: the total-ED forecast is inherently more accurate than any single "
            "specialty's (which is why low-volume specialties get wider, humbler ranges). "
            "Inventory: stock held centrally for the whole department needs less total safety "
            "stock than the same items scattered across wards — pooling the uncertainty pools "
            "the buffer. When a user asks why the specialty forecast looks rougher than the "
            "total, risk pooling is the answer."
        ),
    },
    "lead_time_rules": {
        "title": "Lead time — the quiet driver of every stock decision",
        "keywords": "lead time delivery wait supplier delay longer shorter horizon crossover reorder point why lead time matters variability",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "Lead time L is the exposure window: everything that will be consumed before a "
            "new order lands must already be covered when you order. Both the reorder point "
            "and the safety stock grow with L — and with the VARIABILITY of L, which is often "
            "worse than its length. One honest subtlety this app surfaces: a forecast only "
            "helps ordering when its horizon reaches across the lead time. With a 7-day "
            "forecast and a 17-day lead time, simple continuous-review rules can beat the "
            "fancy forecast-driven policy — the lead-time sweep on the Supply page shows "
            "exactly where that crossover sits."
        ),
    },
    "push_pull": {
        "title": "Push vs pull — planning on forecast vs reacting to demand",
        "keywords": "push pull strategy boundary make to stock react forecast driven anticipate order ahead reactive proactive",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "PUSH decisions are made ahead of demand, on a forecast (ordering stock for next "
            "month, rostering nurses for next week). PULL decisions react to actual demand "
            "(calling a locum this afternoon, emergency-ordering a stockout). Pull is accurate "
            "but expensive and slow exactly when you need speed; push is cheap and prepared "
            "but lives or dies by forecast quality. A well-run ED pushes what it can predict "
            "and keeps pull as the exception — this app's whole purpose is moving decisions "
            "from expensive last-minute pull to well-informed push."
        ),
    },
    # --- Machine-learning foundation cards (Python Machine Learning tutorial,
    # distilled and tied to this app's ML engine). ----------------------------
    "ml_learning": {
        "title": "What machine learning actually is — learning from examples",
        "keywords": "machine learning what is ml how learn train supervised unsupervised examples pattern algorithm teach data driven",
        "source": "Python Machine Learning tutorial (supervised learning)",
        "body": (
            "Machine learning replaces hand-written rules with learned ones: show an algorithm "
            "thousands of examples of 'situation -> outcome' and it finds the mapping itself. "
            "SUPERVISED learning (what this app uses) learns from labelled history — two years "
            "of 'this calendar day, this weather, these recent arrivals -> this many patients'. "
            "UNSUPERVISED learning finds structure without labels (e.g. clustering similar days "
            "together) — a useful future lens, but not what drives the forecasts here. The "
            "practical consequence: the model is only as wise as the history it saw, which is "
            "why regime changes (like COVID) matter so much."
        ),
    },
    "overfitting": {
        "title": "Overfitting — when a model memorises instead of learning",
        "keywords": "overfitting underfitting memorise generalise train test split holdout too complex fits noise validation unseen",
        "source": "Python Machine Learning tutorial (model evaluation)",
        "body": (
            "A model can score perfectly on the data it trained on by memorising its noise — "
            "and then fail on tomorrow. That is OVERFITTING. The defence is discipline, not "
            "cleverness: judge the model only on data it never saw (a held-out slice of "
            "history; in this app, honest backtests), and keep the model no more complex than "
            "the data justifies. UNDERFITTING is the opposite failure — a model too simple to "
            "capture the real pattern (e.g. ignoring the weekly rhythm). Every accuracy figure "
            "in this app comes from held-out data, never from training fit — that is the only "
            "score that predicts real-world behaviour."
        ),
    },
    "features": {
        "title": "Features — the clues a model is allowed to see",
        "keywords": "features feature engineering inputs variables clues lags rolling calendar signals what model sees domain knowledge",
        "source": "Python Machine Learning tutorial (feature extraction)",
        "body": (
            "A model cannot use what it is not shown. FEATURES are its senses, and feature "
            "engineering — choosing and shaping them — is where domain knowledge enters the "
            "mathematics. This app's ML engine sees ten clues per day: which weekday and month "
            "it is, whether it's a weekend, arrivals 1/2/3/7 days ago (momentum and weekly "
            "rhythm), and rolling averages and spread (the local level and volatility). Good "
            "features beat fancy algorithms: most of a model's skill is decided before "
            "training starts, by what it is allowed to look at — and every feature must be "
            "knowable BEFORE the day being predicted, or you have leakage."
        ),
    },
    "preprocessing": {
        "title": "Preprocessing — why clean data beats clever models",
        "keywords": "preprocessing cleaning missing values outliers garbage in quality prepare raw data transform scale strange wrong odd broken suspect weird looks off",
        "source": "Python Machine Learning tutorial (data preprocessing)",
        "body": (
            "Real data arrives dirty: missing days, duplicated rows, impossible zeros, "
            "outliers that are really data-entry errors. Feeding that to any algorithm gives "
            "confident nonsense — garbage in, garbage out. Preprocessing fixes it once, "
            "centrally, and honestly (flagging what was changed): this app's Prepare step "
            "drops empty columns, audits duplicate dates, flags zero-arrival days and labels "
            "COVID regimes before any model trains. When a forecast looks strange, a data "
            "problem upstream is ALWAYS the first suspect — check the Data Health view before "
            "doubting the model."
        ),
    },
    "bias_variance": {
        "title": "The bias-variance trade-off — why bigger isn't better",
        "keywords": "bias variance trade off complexity deeper trees simple complex model size tune why not bigger deep learning",
        "source": "Python Machine Learning tutorial (model selection)",
        "body": (
            "Model complexity is a dial, not a virtue. Too simple = BIAS: the model can't "
            "express the real pattern. Too complex = VARIANCE: it bends to every accident of "
            "the training sample and won't generalise. The sweet spot depends on how much "
            "data you have — with roughly two years of daily history, moderate models (this "
            "app uses boosted trees of depth 4) beat both a straight line and a deep neural "
            "network, which would need far more data to earn its complexity. This is also why "
            "'why not use deep learning / AI like ChatGPT to forecast?' has a principled "
            "answer: at this data size, it would overfit — proven by backtest, not opinion."
        ),
    },
    "ensembles": {
        "title": "Ensembles — many weak learners, one strong forecast",
        "keywords": "ensemble boosting bagging trees weak learners combine why many small models sequential errors correct",
        "source": "Python Machine Learning tutorial (ensemble methods)",
        "body": (
            "Ask one expert and you get their blind spots; ask two hundred and average, and "
            "the blind spots cancel. Ensembles apply this to models. BAGGING trains many "
            "models on shuffled samples and averages them (random forests). BOOSTING — what "
            "this app's ML engine uses — trains small trees in sequence, each one focusing on "
            "the errors the previous ones still make, so the ensemble improves where it is "
            "weakest. Each tree alone is a mediocre forecaster; two hundred of them, each "
            "correcting the last, is what makes the ML engine usually the most accurate "
            "choice on the forecast pages."
        ),
    },

    "value_of_information": {
        "title": "The value of information — what accuracy is worth in Rand",
        "keywords": "value information accuracy worth money rand savings better forecast pays sharing information why invest",
        "source": "Simchi-Levi et al., Designing and Managing the Supply Chain",
        "body": (
            "Information substitutes for inventory and panic capacity. Simchi-Levi's central "
            "lesson: sharing true demand information (rather than distorted orders) removes "
            "the buffers everyone holds against uncertainty. In this app the principle is "
            "priced explicitly: safety stock scales with forecast error, so every point of "
            "accuracy converts into fewer locum hours and less capital tied up in stock — the "
            "Optimization page's 'compare both forecasts' button literally shows the Rand "
            "value of the better model. When management asks why forecasting deserves budget, "
            "this is the argument."
        ),
    },
}

_STOP = {"the", "a", "an", "is", "of", "to", "and", "how", "what", "why", "do", "does",
         "in", "on", "for", "this", "that", "it", "me", "explain", "tell", "about"}


# Short domain terms that must survive the length filter ("ml forecast", "ed").
_SHORT_OK = {"ml", "ed", "ss"}


def search(query: str, k: int = 2) -> list[dict]:
    """Return up to k knowledge cards best matching the query (keyword overlap)."""
    words = [w for w in "".join(c if c.isalnum() else " " for c in (query or "").lower()).split()
             if w not in _STOP and (len(w) > 2 or w in _SHORT_OK)]
    if not words:
        return []
    scored = []
    for cid, card in CARDS.items():
        hay = (card["title"] + " " + card["keywords"]).lower()
        score: float = sum(hay.count(w) for w in words)
        # light boost if a query word appears in the title
        score += 2 * sum(1 for w in words if w in card["title"].lower())
        # body text at half weight — recall for queries phrased in the card's
        # own words, without letting long bodies outrank curated keywords
        body = card["body"].lower()
        score += 0.5 * sum(body.count(w) for w in words)
        if score > 0:
            scored.append((score, cid, card))
    scored.sort(key=lambda x: -x[0])
    return [{"topic": cid, "title": c["title"], "source": c["source"], "explanation": c["body"]}
            for _, cid, c in scored[:k]]


def topics() -> list[dict]:
    return [{"topic": cid, "title": c["title"]} for cid, c in CARDS.items()]
