def normalize_tags(tags: list[str]) -> list[str]:
    """Normalize and deduplicate tags without mutating the input."""
    if not isinstance(tags, list):
        raise TypeError('tags must be a list')
    result = []
    seen = set()
    for tag in tags:
        if not isinstance(tag, str):
            raise TypeError('every tag must be a string')
        normalized = tag.strip().casefold()
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result
