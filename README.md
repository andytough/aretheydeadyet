# Are They Dead Yet?

A website that lets you search for well-known people and find out whether they are dead, or not dead yet.

**Live site:** [www.aretheydeadyet.rip](https://www.aretheydeadyet.rip)

---

## Features

### Person search
Type any name into the search box to get an autocomplete dropdown of matching people. Select a person to see their status, date of birth, and — if deceased — their date of death.

### Band member and film cast search
Typing the name of a band or film will expand the dropdown to include the individual members or cast, not the band or film itself. For example, typing *Queen* will list Freddie Mercury, Brian May, Roger Taylor and John Deacon. This works for any group where membership data is available on Wikidata.

### Special person entries
Certain individuals have a hand-crafted entry that appears alongside the standard result — for example, a relevant quote, lyric or note. Currently this includes:

- **Syd Barrett** (Pink Floyd founder)
- **Jazz Coleman** (Killing Joke)
- **Geordie Walker** (Killing Joke)

---

## How it works

The site is entirely client-side. There is no backend server. All data is fetched live from [Wikidata](https://www.wikidata.org), the free knowledge base maintained by the Wikimedia Foundation.

### Search autocomplete
As you type, the site queries the [Wikidata search API](https://www.wikidata.org/w/api.php?action=wbsearchentities) (`wbsearchentities`) to find matching entities. Results are filtered to people who have a date of birth recorded on Wikidata.

### Group member expansion
In parallel with the person search, the site queries the Wikidata SPARQL endpoint to find members of any groups in the results:

- First using property **P527** (has part / has member) — used for bands and music groups
- If no P527 results are found, it falls back to **P161** (cast member) — used for films

This two-stage approach ensures that a band search returns band members, not film casts, even when both share a name.

### Person lookup
When a person is selected, a SPARQL query fetches:
- Date of birth (`P569`)
- Date of death (`P570`) — absence of this determines "not dead yet"
- Gender (`P21`) — used to select the correct alive/deceased image
- Wikipedia article link (`schema:about`)

### Special person entries
When a person's result is displayed, the site automatically attempts to load `people/{WikidataID}.html`. If the file exists it is displayed alongside the standard result; if not, the lookup continues silently. The Wikidata ID is included as an HTML comment in every result page, making it easy to find via View Source.

---

## Tech stack

| Component | Detail |
|---|---|
| HTML / CSS / JS | Vanilla, no frameworks or build tools |
| CSS framework | [Skeleton](http://getskeleton.com) (responsive grid) |
| Data source | [Wikidata](https://www.wikidata.org) via REST and SPARQL APIs |
| Analytics | [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) (cookie-free) |
| Hosting | Static site — no server-side code |

---

## File structure

```
/
├── index.html                  Main page
├── privacy.html                Privacy policy
├── robots.txt                  Search engine indexing control
├── sitemap.xml                 Sitemap for search engines
├── site.webmanifest            PWA manifest (home screen icon support)
├── css/
│   └── main.css                All styles (normalize + skeleton + site styles)
├── js/
│   └── script.js               Core application logic
├── people/
│   ├── Q173061.html            Syd Barrett
│   ├── Q1361323.html           Jazz Coleman
│   └── Q1740276.html           Geordie Walker
└── img/
    ├── grim-reaper.webp        Background image (desktop)
    ├── grim-reaper-md.webp     Background image (tablet)
    ├── grim-reaper-sm.webp     Background image (mobile)
    ├── grim-reaper_icon_black.webp  Header icon (light theme)
    ├── grim-reaper_icon_white.webp  Header icon (dark theme)
    ├── dead.png                Shown when person is deceased
    ├── alive-male.png          Shown when male person is alive
    └── alive-female.png        Shown when female person is alive
```

---

## Running locally

The site is a static HTML app with no build step. You can run it from any local web server. For example, using Python:

```bash
cd /path/to/aretheydeadyet
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

> **Note:** The site makes live requests to the Wikidata API, so an internet connection is required.

---

## Adding a special person entry

1. Search for the person on the site and use **View Source** (or browser DevTools) to find their Wikidata ID in the HTML comment:
    ```html
    <!-- Wikidata ID: Q173061 -->
    ```

2. Create a file in the `people/` directory named after that ID — e.g. `people/Q173061.html`. This can contain any HTML — a quote, a note, an image, a link:
    ```html
    <!-- Person Name -->
    <figure>
      <blockquote>
        <p>A relevant quote or note.</p>
      </blockquote>
      <figcaption>Source or attribution</figcaption>
    </figure>
    ```

3. Deploy — the entry will be detected and displayed automatically. No other files need to be edited.

---

## Performance

Scores 100/100 on [Google PageSpeed Insights](https://pagespeed.web.dev/) for both mobile and desktop.

---

## Privacy

The site does not collect personal data and sets no cookies. Search queries result in direct browser requests to Wikidata servers, which will receive the user's IP address. See the [Privacy Policy](https://www.aretheydeadyet.rip/privacy.html) for full details.