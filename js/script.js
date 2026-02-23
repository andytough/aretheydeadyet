// Wikidata SPARQL endpoint for querying data
const endpoint = "https://query.wikidata.org/sparql";

/**
 * Generates a SPARQL query to fetch the English label (name) for a person
 * @param {string} personId - The Wikidata ID (e.g., "Q40531")
 * @returns {string} SPARQL query string
 */
function getLabelQuery(personId) {
    return `
    SELECT ?personLabel 
    WHERE {
      wd:${personId} rdfs:label ?personLabel.
      FILTER(LANG(?personLabel) = "en")
    }`;
}


/**
 * Generates a SPARQL query to fetch detailed information about a person
 * Retrieves: date of birth, date of death, gender, age at death, and Wikipedia article URL
 * @param {string} personId - The Wikidata ID (e.g., "Q40531")
 * @returns {string} SPARQL query string
 */
function getSparqlQuery(personId) {
    return `
    SELECT ?dateOfBirth ?dateOfDeath ?genderLabel ?article
           (YEAR(?dateOfDeath) - YEAR(?dateOfBirth) AS ?ageAtDeath)
    WHERE {
      wd:${personId} wdt:P569 ?dateOfBirth;
                      OPTIONAL { wd:${personId} wdt:P570 ?dateOfDeath. }
                      OPTIONAL { wd:${personId} wdt:P21 ?gender. }
                      OPTIONAL {
                        ?article schema:about wd:${personId};
                                 schema:isPartOf <https://en.wikipedia.org/>.
                      }
                      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?gender rdfs:label ?genderLabel }
    }`;
}

/**
 * Filters a list of Wikidata IDs to only include entities that have a date of birth
 * This helps filter out non-person entities from search results
 * @param {Array} ids - Array of Wikidata IDs to check
 * @returns {Promise<Array>} Promise that resolves to array of valid IDs with birth dates
 */
function getEntitiesWithDOB(ids) {
    // Create a VALUES clause with all IDs to check in one query
    const valuesClause = ids.map(id => `wd:${id}`).join(' ');
    const query = `
    SELECT ?entity WHERE {
        VALUES ?entity { ${valuesClause} }
        ?entity wdt:P569 ?dob.
    }`;
    const url = endpoint + "?query=" + encodeURIComponent(query) + "&format=json";

    return fetch(url)
        .then(response => response.json())
        .then(data => data.results.bindings.map(binding => binding.entity.value.split('/').pop()))
        .catch(() => []);
}

/**
 * Queries Wikidata for members of groups (bands, films, TV shows, sports teams, etc.)
 * Uses P527 (has part) for bands/ensembles/teams and P161 (cast member) for films/TV shows
 * Only returns members who have a date of birth (i.e. real people)
 * @param {Array} ids - Array of Wikidata IDs to check for group membership
 * @returns {Promise<Array>} Promise resolving to array of { id, label, groupLabel } objects
 */
function getMembersOfGroups(allItems) {
    if (allItems.length === 0) return Promise.resolve([]);

    const makeValuesClause = arr => arr.map(id => `wd:${id}`).join(' ');

    // Map each item ID to its search rank (lower index = more relevant)
    const groupRank = new Map(allItems.map((item, index) => [item.id, index]));

    // Deduplicates member results by member ID, keeping the entry whose source group
    // ranked highest (lowest index) in the original search results
    function dedupeByBestGroup(results) {
        const memberMap = new Map();
        results.forEach(result => {
            const existing = memberMap.get(result.id);
            const currentRank = groupRank.get(result.groupId) ?? Infinity;
            const existingRank = existing ? (groupRank.get(existing.groupId) ?? Infinity) : Infinity;
            if (!existing || currentRank < existingRank) {
                memberMap.set(result.id, result);
            }
        });
        return Array.from(memberMap.values()).map(({ id, label, groupLabel }) => ({ id, label, groupLabel }));
    }

    // Parse SPARQL bindings into member result objects
    function parseMembers(bindings) {
        return bindings.map(binding => ({
            id: binding.member.value.split('/').pop(),
            label: binding.memberLabel ? binding.memberLabel.value : '',
            groupLabel: binding.groupLabel ? binding.groupLabel.value : '',
            groupId: binding.group.value.split('/').pop()
        }));
    }

    // Fetch a SPARQL query, returning an empty result set on any error
    function fetchSparql(query) {
        return fetch(endpoint + "?query=" + encodeURIComponent(query) + "&format=json")
            .then(response => response.json())
            .catch(() => ({ results: { bindings: [] } }));
    }

    // Filter out music recordings (albums, songs, EPs, etc.) from P527 candidates.
    // Their descriptions from wbsearchentities are already available — no extra query needed.
    // This stops album entities like "Led Zeppelin IV" from returning band members
    // and labelling them "(Led Zeppelin IV)" instead of "(Led Zeppelin)".
    const albumPattern = /\b(album|song|single|EP|extended play|recording|compilation)\b/i;
    const p527Ids = allItems
        .filter(item => !item.description || !albumPattern.test(item.description))
        .map(item => item.id);

    const allIds = allItems.map(item => item.id);

    const p527Query = p527Ids.length === 0 ? null : `
    SELECT DISTINCT ?member ?memberLabel ?group ?groupLabel WHERE {
        VALUES ?group { ${makeValuesClause(p527Ids)} }
        ?group wdt:P527 ?member.
        ?member wdt:P569 ?dob.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 50`;

    const p527Promise = p527Query
        ? fetchSparql(p527Query).then(data => parseMembers(data.results.bindings))
        : Promise.resolve([]);

    return p527Promise.then(p527Results => {
        // If any P527 members were found, return them exclusively.
        // Do NOT fall back to P161 — this prevents a band search (e.g. "Pink Floyd")
        // from also showing cast members of an associated film ("The Wall")
        // that happens to appear in the same search results.
        if (p527Results.length > 0) {
            return dedupeByBestGroup(p527Results);
        }

        // No P527 members found — try P161 (film/TV cast) for all items
        const p161Query = `
        SELECT DISTINCT ?member ?memberLabel ?group ?groupLabel WHERE {
            VALUES ?group { ${makeValuesClause(allIds)} }
            ?group wdt:P161 ?member.
            ?member wdt:P569 ?dob.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT 50`;

        return fetchSparql(p161Query)
            .then(data => dedupeByBestGroup(parseMembers(data.results.bindings)));
    }).catch(() => []);
}


/**
 * Formats an ISO date string to DD/MM/YYYY format
 * @param {string} dateString - ISO format date string
 * @returns {string} Formatted date string (DD/MM/YYYY)
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = ("0" + date.getDate()).slice(-2);
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}


/**
 * Main function to fetch and display all details about a person
 * First fetches the person's name, then their details, then displays everything
 * @param {string} personId - The Wikidata ID (e.g., "Q40531")
 */
function fetchDetails(personId) {
    // First, get the person's name in English
    const labelQuery = getLabelQuery(personId);
    const labelUrl = endpoint + "?query=" + encodeURIComponent(labelQuery) + "&format=json";


    fetch(labelUrl)
    .then(response => response.json())
    .then(data => {
        if (data.results.bindings.length > 0) {
            const personLabel = data.results.bindings[0].personLabel.value;
            
            // Now get all other details about the person
            const detailsQuery = getSparqlQuery(personId);
            const detailsUrl = endpoint + "?query=" + encodeURIComponent(detailsQuery) + "&format=json";


            fetch(detailsUrl)
            .then(response => response.json())
            .then(data => {
                if (data.results.bindings.length > 0) {
                    const personInfo = data.results.bindings[0];
                    
                    // Format the dates for display
                    const formattedDOB = personInfo.dateOfBirth ? formatDate(personInfo.dateOfBirth.value) : 'Unknown';
                    const isDeceased = personInfo.dateOfDeath ? true : false;
                    const formattedDOD = isDeceased ? formatDate(personInfo.dateOfDeath.value) : 'N/A';
                    const gender = personInfo.genderLabel ? personInfo.genderLabel.value.toLowerCase() : 'unknown';
                    
                    // Use Wikipedia link if available, otherwise fall back to Wikidata link
                    const personLink = personInfo.article 
                        ? personInfo.article.value 
                        : `https://www.wikidata.org/wiki/${personId}`;
                    
                    // Select appropriate image based on deceased status and gender
                    let imgSrc;
                    if (isDeceased) {
                        imgSrc = '/img/dead.png';
                    } else {
                        switch(gender) {
                            case 'male':
                                imgSrc = '/img/alive-male.png';
                                break;
                            case 'female':
                                imgSrc = '/img/alive-female.png';
                                break;
                            default:
                                // Randomly select between 'alive-rand-01.png' and 'alive-rand-02.png'
                                imgSrc = Math.random() < 0.5 ? '/img/alive-rand-01.png' : '/img/alive-rand-02.png';
                                break;
                        }
                    }

    // Load appropriate CSS file based on deceased status
    addCssLink(isDeceased);

                    // Set up display variables
                    const statusClass = isDeceased ? 'dead' : 'alive';
                    const imgId = isDeceased ? 'dead' : 'alive';
                    const imgAlt = isDeceased ? 'picture representing death' : 'picture representing life';
                    const status  = isDeceased ? 'DEAD' : 'not dead yet';

                    // Build the HTML content to display
                    let htmlContent = `
                        <div id="status" class="${statusClass}">
                            <p class="status"><a href="${personLink}" class="status" target="_blank">${personLabel}</a> is ${status}</p>
                            <!--<p><strong>Date of Birth:</strong> ${formattedDOB}</p>
                            <p><strong>Date of Death:</strong> ${formattedDOD}</p>
                            <p><strong>Gender:</strong> ${gender}</p>-->
                            <!-- Additional content will be inserted here -->
                            <img id="${imgId}" class="${statusClass} u-full-width" alt="${imgAlt}" src="${imgSrc}">
                        </div>
                    `;

                    // Check if this person has special additional content
if (specialPersonIds.includes(personId)) {
    const additionalContentUrl = `people/${personId}.html`; // Path to your HTML files

    // Fetch the additional HTML content
    fetch(additionalContentUrl)
        .then(response => response.text())
        .then(additionalContent => {
            // Insert the additional content after the specific paragraph and before the image
            htmlContent = htmlContent.replace('<!-- Additional content will be inserted here -->', additionalContent);

            document.getElementById('person-info').innerHTML = htmlContent;
        })
        .catch(error => {
            console.error('Error fetching additional content:', error);
            // If there's an error, still display the original content
            document.getElementById('person-info').innerHTML = htmlContent;
        });
} else {
    // If not in the special list, just display the original content
    document.getElementById('person-info').innerHTML = htmlContent;
}

                } else {
                    document.getElementById('person-info').innerHTML = "<p>No details found.</p>";
                }
            })
            .catch(error => {
                console.error('Error fetching details:', error);
                document.getElementById('person-info').innerHTML = "<p>Error fetching details.</p>";
            });
        } else {
            document.getElementById('person-info').innerHTML = "<p>English label not found.</p>";
        }
    })
    .catch(error => {
        console.error('Error fetching label:', error);
        document.getElementById('person-info').innerHTML = "<p>Error fetching label.</p>";
    });
}


/**
 * Dynamically adds the appropriate CSS file (dead.css or alive.css) to the page
 * Removes any previously added custom stylesheet first to avoid conflicts
 * @param {boolean} isDeceased - True if person is deceased, false if alive
 */
function addCssLink(isDeceased) {
    const head = document.head;
    const link = document.createElement('link');

    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = isDeceased ? 'css/dead.css' : 'css/alive.css';

    // Remove existing custom stylesheet if present
    const existingLink = document.querySelector('link[rel=stylesheet][data-custom-style]');
    if (existingLink) {
        head.removeChild(existingLink);
    }

    // Add the new stylesheet
    link.setAttribute('data-custom-style', ''); // Mark this link for easy identification
    head.appendChild(link);
}




/**
 * Handles the autocomplete search functionality
 * Triggers when user types in the search box (minimum 3 characters)
 * Uses JSONP to fetch search suggestions from Wikidata API
 */
function autocompleteSearch() {
    const name = document.getElementById('search-box').value;
    
    // Only search if at least 3 characters have been entered
    if (name.length < 3) {
        document.getElementById('suggestions').style.display = 'none';
        return;
    }

    // Create a script tag for JSONP request to Wikidata API
    const script = document.createElement('script');
    script.src = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&uselang=en&type=item&continue=0&limit=10&callback=handleAutocompleteResponse`;
    document.head.appendChild(script);
    document.head.removeChild(script);
    
    // Remove active class from any previously highlighted item
    const activeItem = document.querySelector('.suggestion-item.active');
    if (activeItem) {
        activeItem.classList.remove('active');
    }
}




// Incremented each time handleAutocompleteResponse is invoked.
// Used to discard results from earlier in-flight calls when the user
// has continued typing, preventing duplicate entries in the dropdown.
let autocompleteVersion = 0;

/**
 * Callback function that processes autocomplete search results from Wikidata
 * Filters results to only show entities with a date of birth (real people),
 * and also expands group entities (bands, films, sports teams, etc.) into their
 * members/cast by querying P527 and P161 in parallel for better performance
 * Creates clickable suggestion items for each result
 * @param {Object} response - JSON response from Wikidata search API
 */
async function handleAutocompleteResponse(response) {
    // Capture this call's version number. If a newer call starts while we are
    // awaiting SPARQL results, we discard our results to avoid duplicate entries.
    const myVersion = ++autocompleteVersion;

    const suggestionsElement = document.getElementById('suggestions');
    suggestionsElement.innerHTML = '';
    suggestionsElement.style.display = 'block';

    const allItems = response.search;
    const ids = allItems.map(item => item.id);

    // Run both queries in parallel: DOB check for direct people, and member lookup for groups.
    // Pass allItems (not just ids) so getMembersOfGroups can use descriptions to filter albums.
    const [validIds, memberResults] = await Promise.all([
        getEntitiesWithDOB(ids),
        getMembersOfGroups(allItems)
    ]);

    // Direct person matches (existing behaviour)
    const filteredItems = allItems.filter(item => validIds.includes(item.id));

    // Deduplicate direct matches by ID
    const uniqueDirectItems = Array.from(
        new Map(filteredItems.map(item => [item.id, item])).values()
    );

    // Build a set of IDs already in direct matches to avoid duplicates
    const directIds = new Set(uniqueDirectItems.map(item => item.id));

    // Deduplicate group member results, excluding anyone already in direct matches.
    // Also filter out entries whose label is a raw Wikidata Q-ID (e.g. "Q192936"),
    // which happens when Wikidata has no English label for that entity.
    const uniqueMemberItems = Array.from(
        new Map(
            memberResults
                .filter(m => !directIds.has(m.id))
                .filter(m => !/^Q\d+$/.test(m.label))
                .map(m => [m.id, m])
        ).values()
    );

    // Combine: direct person matches first, then group members
    const allDisplayItems = [...uniqueDirectItems, ...uniqueMemberItems];

    // A newer search has been initiated while we were awaiting — discard these results
    if (autocompleteVersion !== myVersion) return;

    if (allDisplayItems.length === 0) {
        suggestionsElement.innerHTML = '<div class="suggestion-item">No results found.</div>';
        return;
    }

    // Create a clickable suggestion item for each result
    allDisplayItems.forEach(item => {
        let displayText = item.label;
        if (item.description) {
            // Remove death date (if present) from description for cleaner display
            const descriptionWithoutDeathDate = item.description.replace(/[-–—]\d{4}/, '');
            displayText += ` - ${descriptionWithoutDeathDate}`;
        }
        // For group-expanded members, append the group name for context
        if (item.groupLabel) {
            displayText += ` (${item.groupLabel})`;
        }

        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.setAttribute('data-id', item.id);
        div.textContent = displayText;

        // Add click handler to fetch details when suggestion is clicked
        div.addEventListener('click', function () {
            const personId = this.getAttribute('data-id');
            fetchDetails(personId);
            suggestionsElement.style.display = 'none';
        });

        suggestionsElement.appendChild(div);
    });
}


// Event listener: trigger autocomplete search when user types in search box
document.getElementById('search-box').addEventListener('input', autocompleteSearch);

// Event listener: handle selection from suggestions dropdown (legacy support)
document.getElementById('suggestions').addEventListener('change', function() {
    const personId = this.value;
    fetchDetails(personId);
    this.style.display = 'none';
});


// ===== DOM MANIPULATION FUNCTIONS =====

/**
 * Runs when the page first loads
 * Checks if person-info div has any content with classes and removes 'atdy' class if so
 * This helps with styling/layout adjustments
 */
document.addEventListener('DOMContentLoaded', function() {
    var personInfo = document.getElementById('person-info');
    var childDivs = personInfo.getElementsByTagName('div');

    // Check each child div for a class
    for (var i = 0; i < childDivs.length; i++) {
        if (childDivs[i].className) {
            // If a child div with a class is found, remove 'atdy' class from the other div
            var atdyDiv = document.querySelector('.atdy');
            if (atdyDiv) {
                atdyDiv.classList.remove('atdy');
                break; // Exit the loop as the class is already removed
            }
        }
    }
});


// ===== KEYBOARD NAVIGATION =====

// Event listener: handle keyboard navigation in search box
document.getElementById('search-box').addEventListener('keydown', function(event) {
    handleKeyPress(event);
});


/**
 * Handles keyboard navigation through autocomplete suggestions
 * Arrow Up/Down: navigate through suggestions
 * Enter: select highlighted suggestion
 * @param {Event} event - The keyboard event
 */
function handleKeyPress(event) {
    const suggestionsContainer = document.getElementById('suggestions');
    const activeItem = document.querySelector('.suggestion-item.active');
    let newActiveItem;

    switch (event.key) {
        case 'ArrowDown':
            // Move to next suggestion, or wrap to first if at end
            if (activeItem) {
                newActiveItem = activeItem.nextElementSibling || suggestionsContainer.firstElementChild;
            } else {
                newActiveItem = suggestionsContainer.firstElementChild;
            }
            break;

        case 'ArrowUp':
            // Move to previous suggestion, or wrap to last if at beginning
            if (activeItem) {
                newActiveItem = activeItem.previousElementSibling || suggestionsContainer.lastElementChild;
            } else {
                newActiveItem = suggestionsContainer.lastElementChild;
            }
            break;

        case 'Enter':
            // Select the currently highlighted suggestion
            if (activeItem) {
                activeItem.click();
                suggestionsContainer.style.display = 'none'; // Hide the suggestions list
                event.preventDefault(); // Prevent default to stop any unintended behavior
                return;
            }
            break;
    }

    // Update the active item highlight
    if (newActiveItem) {
        if (activeItem) {
            activeItem.classList.remove('active');
        }
        newActiveItem.classList.add('active');
        event.preventDefault(); // Prevent default to stop any unintended behavior
    }
}




// ===== MUTATION OBSERVER =====

/**
 * MutationObserver that watches for changes to the person-info div
 * When new content is added, it removes the 'atdy' class if needed
 * This ensures proper styling when person details are displayed
 */
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
            var personInfo = document.getElementById('person-info');
            if (personInfo.querySelector('div[class]')) {
                var atdyDiv = document.querySelector('.atdy');
                if (atdyDiv) {
                    atdyDiv.classList.remove('atdy');
                }
            }
        }
    });
});

// Start observing the person-info element for changes
var targetNode = document.getElementById('person-info');
var config = { childList: true };

observer.observe(targetNode, config);