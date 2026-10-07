# Feature guide

Source for `docs/Coverboard-Feature-Guide.pdf`.

- `content.py`: the text: chapters, features (summary, how it works, code paths, legal references), diagrams' notes and known limitations. The block at the end holds the 7 Oct 2026 updates.
- `build.py`: lays it out with ReportLab.
- `check.py`: checks the content against the repo before building.

## Build

```sh
cd docs/guide
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python check.py --links      # code paths, cross-references and links
.venv/bin/python build.py ../Coverboard-Feature-Guide.pdf
```

The build uses macOS system fonts (Arial and Courier New in `/System/Library/Fonts/Supplemental`), so it runs on a Mac.

## Updating

When a feature changes, update its entry in `content.py` (code paths, how it works, references), run `check.py --links`, rebuild, and look over the changed pages. Legal references should point to GOV.UK or legislation.gov.uk; keep the known limitations honest.
