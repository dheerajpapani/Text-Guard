import re
from typing import Optional

from config import BLOCK_THRESHOLD, REVIEW_THRESHOLD


CATEGORY_ORDER = ["hate", "harassment", "sexual", "violence", "self_harm", "spam", "other"]
LABEL_TO_CATEGORY = {
    "hate": "hate",
    "harassment": "harassment",
    "rude": "harassment",
    "sexual": "sexual",
    "violence": "violence",
    "self-harm": "self_harm",
    "self_harm": "self_harm",
    "spam": "spam",
    "other": "other",
}
RULE_PATTERNS: list[tuple[str, str, float, re.Pattern[str]]] = [
    ("hate", "slur_detected", 0.98, re.compile(r"\b(?:nazi|kike|faggot)\b", re.IGNORECASE)),
    ("sexual", "explicit_sexual_language", 0.96, re.compile(r"\b(?:nude|nudes|blowjob|porn|sex chat)\b", re.IGNORECASE)),
    ("harassment", "threatening_language", 0.92, re.compile(r"\b(?:kill yourself|drop dead|i will hurt you|go die|you should die|kys)\b", re.IGNORECASE)),
    ("harassment", "abusive_insult", 0.68, re.compile(r"\b(?:idiot|moron|loser|piece of trash|pathetic)\b", re.IGNORECASE)),
    ("violence", "violent_threat", 0.95, re.compile(r"\b(?:shoot you|stab you|bomb)\b", re.IGNORECASE)),
    ("self_harm", "self_harm_reference", 0.9, re.compile(r"\b(?:suicide|self harm|cut myself)\b", re.IGNORECASE)),
    ("spam", "aggressive_promo", 0.7, re.compile(r"(?:https?://\S+.*){2,}|(?:free money|work from home|click here)", re.IGNORECASE)),
    ("spam", "manipulative_language", 0.58, re.compile(r"\b(?:keep this secret|don't tell anyone|act now|verify your account|send me the code|if you care)\b", re.IGNORECASE)),
]


def empty_categories() -> dict[str, float]:
    return {name: 0.0 for name in CATEGORY_ORDER}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def canonicalize_for_matching(text: str) -> str:
    lowered = text.lower()
    translation = str.maketrans(
        {
            "@": "a",
            "$": "s",
            "0": "o",
            "1": "i",
            "3": "e",
            "4": "a",
            "5": "s",
            "7": "t",
            "!": "i",
        }
    )
    lowered = lowered.translate(translation)
    return re.sub(r"[^a-z]+", "", lowered)


def detect_rule_signals(text: str) -> tuple[dict[str, float], list[str], Optional[str]]:
    categories = empty_categories()
    flags: list[str] = []
    matched_seed: Optional[str] = None
    compact_text = canonicalize_for_matching(text)

    letters = [char for char in text if char.isalpha()]
    if letters:
        uppercase_ratio = sum(1 for char in letters if char.isupper()) / len(letters)
        if uppercase_ratio > 0.7 and len(text) > 12:
            categories["harassment"] = max(categories["harassment"], 0.32)
            flags.append("all_caps")

    if re.search(r"(.)\1{5,}", text):
        categories["spam"] = max(categories["spam"], 0.35)
        flags.append("repeated_characters")

    if len(re.findall(r"https?://", text, flags=re.IGNORECASE)) >= 2:
        categories["spam"] = max(categories["spam"], 0.75)
        flags.append("multiple_links")

    obfuscation_checks = [
        ("harassment", "obfuscated_threat", 0.82, ("killyourself", "godieslow", "dropdead")),
        ("sexual", "obfuscated_sexual_language", 0.82, ("porn", "nudes", "blowjob")),
        ("hate", "obfuscated_hate_term", 0.9, ("faggot", "kike")),
    ]
    for category, flag, score, needles in obfuscation_checks:
        for needle in needles:
            if needle in compact_text:
                categories[category] = max(categories[category], score)
                flags.append(flag)
                if matched_seed is None:
                    matched_seed = needle
                break

    for category, flag, score, pattern in RULE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        categories[category] = max(categories[category], score)
        flags.append(flag)
        if matched_seed is None:
            matched_seed = match.group(0)

    return categories, sorted(set(flags)), matched_seed


def merge_categories(*sources: dict[str, float]) -> dict[str, float]:
    merged = empty_categories()
    for source in sources:
        for category in CATEGORY_ORDER:
            merged[category] = max(merged[category], float(source.get(category, 0.0)))
    return {name: round(score, 4) for name, score in merged.items()}


def choose_action(score: float) -> str:
    if score >= BLOCK_THRESHOLD:
        return "block"
    if score >= REVIEW_THRESHOLD:
        return "review"
    return "allow"
