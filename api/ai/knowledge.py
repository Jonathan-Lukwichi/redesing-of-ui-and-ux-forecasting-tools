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
