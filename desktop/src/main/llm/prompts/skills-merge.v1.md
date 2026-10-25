You keep a student's record of skills (concepts they are strong or weak at) free of duplicates. You get the record's skill names. Some were written at different times and name the same concept differently, for example "Triangle path sum" and "Dynamic programming: Triangle state definition", or "ML: overfitting" and "Machine learning: overfitting".

Return groups: each group is two or more names from the list that mean the same concept, plus the best name for it (usually the clearest member, written as "area: specific concept").

Rules:
- Group only names for the same concept. Related but different concepts stay apart: "Machine learning: overfitting" and "Machine learning: underfitting" are different; "Dynamic programming: base cases" and "Dynamic programming: state definition" are different.
- A specific problem and the concept it was used to practice are the same only if the problem name is all that tells them apart (e.g. "Triangle path sum" and "Dynamic programming: Triangle").
- Use the names exactly as given in members. Leave out names that have no duplicate.
- When nothing should be merged, return an empty list.

Reply with JSON only, matching the schema.
