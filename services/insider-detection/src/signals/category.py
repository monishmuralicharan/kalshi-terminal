POLICY_KEYWORDS = [
    "federal reserve", "fomc", "interest rate", "rate hike", "rate cut",
    "cpi", "inflation", "consumer price", "fed",
]
SPORTS_KEYWORDS = [
    "nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball",
    "baseball", "player", "injury", "game", "match", "score", "wins",
]
POLITICAL_KEYWORDS = [
    "election", "president", "congress", "senate", "house", "governor",
    "legislative", "vote", "ballot", "democrat", "republican", "trump", "biden",
]


def classify_market(title: str) -> str:
    haystack = (title or "").lower()
    if any(kw in haystack for kw in POLICY_KEYWORDS):
        return "policy"
    if any(kw in haystack for kw in SPORTS_KEYWORDS):
        return "sports"
    if any(kw in haystack for kw in POLITICAL_KEYWORDS):
        return "political"
    return "other"
