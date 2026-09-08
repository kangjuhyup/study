def normalize_tags(tags: list[str]) -> list[str]:
    """Trim and lowercase tags, discarding blanks, without mutating input."""
    if not isinstance(tags, list):
        raise TypeError('tags must be a list')
    result = []
    for tag in tags:
        if not isinstance(tag, str):
            raise TypeError('every tag must be a string')
        normalized = tag.strip().lower()
        if normalized:
            result.append(normalized)
    return result
