const endpoint = "https://query.wikidata.org/sparql";

function getLabelQuery(personId) {
    return `
    SELECT ?personLabel 
    WHERE {
      wd:${personId} rdfs:label ?personLabel.
      FILTER(LANG(?personLabel) = "en")
    }`;
}

function getSparqlQuery(personId) {
    return `
    SELECT ?dateOfBirth ?dateOfDeath ?genderLabel 
           (YEAR(?dateOfDeath) - YEAR(?dateOfBirth) AS ?ageAtDeath)
    WHERE {
      wd:${personId} wdt:P31 wd:Q5 .  # Add this line here to filter for humans only
      wd:${personId} wdt:P569 ?dateOfBirth;
                      OPTIONAL { wd:${personId} wdt:P570 ?dateOfDeath. }
                      OPTIONAL { wd:${personId} wdt:P21 ?gender. }
                      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?gender rdfs:label ?genderLabel }
    }`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const day = ("0" + date.getDate()).slice(-2);
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function fetchDetails(personId) {
    const labelQuery = getLabelQuery(personId);
    const labelUrl = endpoint + "?query=" + encodeURIComponent(labelQuery) + "&format=json";

    fetch(labelUrl)
    .then(response => response.json())
    .then(data => {
        if (data.results.bindings.length > 0) {
            const personLabel = data.results.bindings[0].personLabel.value;
            const detailsQuery = getSparqlQuery(personId);
            const detailsUrl = endpoint + "?query=" + encodeURIComponent(detailsQuery) + "&format=json";

            fetch(detailsUrl)
            .then(response => response.json())
            .then(data => {
                if (data.results.bindings.length > 0) {
                    const personInfo = data.results.bindings[0];
                    const formattedDOB = personInfo.dateOfBirth ? formatDate(personInfo.dateOfBirth.value) : 'Unknown';
                    const isDeceased = personInfo.dateOfDeath ? true : false;
                    const formattedDOD = isDeceased ? formatDate(personInfo.dateOfDeath.value) : 'N/A';
                    const gender = personInfo.genderLabel ? personInfo.genderLabel.value.toLowerCase() : 'unknown';
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

    addCssLink(isDeceased);

                    const statusClass = isDeceased ? 'dead' : 'alive';
                    const imgId = isDeceased ? 'dead' : 'alive';
                    const imgAlt = isDeceased ? 'picture representing death' : 'picture representing life';
                    const status  = isDeceased ? 'DEAD' : 'ALIVE';



                    let htmlContent = `
                        <div id="status" class="${statusClass}">
                            <p class="status"><a href="https://www.wikidata.org/wiki/${personId}" class="status" target="_blank">${personLabel}</a> is ${status}</p>
                            <!--<p><strong>Date of Birth:</strong> ${formattedDOB}</p>
                            <p><strong>Date of Death:</strong> ${formattedDOD}</p>
                            <p><strong>Gender:</strong> ${gender}</p>-->
                            <!-- Additional content will be inserted here -->
                            <img id="${imgId}" class="${statusClass} u-full-width" alt="${imgAlt}" src="${imgSrc}">
                        </div>
                    `;

                    // Check if the personId is in the special list
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


function autocompleteSearch() {
    const name = document.getElementById('search-box').value;
    if (name.length < 3) {
        document.getElementById('suggestions').style.display = 'none';
        return;
    }

    const script = document.createElement('script');
    script.src = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&uselang=en&type=item&continue=0&limit=10&callback=handleAutocompleteResponse&filter=claim[31:5]`;
    document.head.appendChild(script);
    document.head.removeChild(script);
    
        // Remove active class from any previously highlighted item
    const activeItem = document.querySelector('.suggestion-item.active');
    if (activeItem) {
        activeItem.classList.remove('active');
    }
    // end Remove active class from any previously highlighted item
}


function handleAutocompleteResponse(response) {
    let suggestionsHTML = '';
    response.search.forEach(item => {
        let displayText = item.label;
        if (item.description) {
            // Remove the date of death from the description
            const descriptionWithoutDeathDate = item.description.replace(/[-–]\d{4}/, '');
            displayText += ` - ${descriptionWithoutDeathDate}`;
        }
        suggestionsHTML += `<div class="suggestion-item" data-id="${item.id}">${displayText}</div>`;
    });

    const suggestionsElement = document.getElementById('suggestions');
    suggestionsElement.innerHTML = suggestionsHTML;
    suggestionsElement.style.display = 'block';

    // Add click event listeners for each suggestion
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', function() {
            const personId = this.getAttribute('data-id');
            fetchDetails(personId);
            suggestionsElement.style.display = 'none';
        });
    });
}

document.getElementById('search-box').addEventListener('input', autocompleteSearch);
document.getElementById('suggestions').addEventListener('change', function() {
    const personId = this.value;
    fetchDetails(personId);
    this.style.display = 'none';
});

// additional

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

// listening for keyboard interactions on the search box
document.getElementById('search-box').addEventListener('keydown', function(event) {
    handleKeyPress(event);
});

// handle key press
function handleKeyPress(event) {
    const suggestionsContainer = document.getElementById('suggestions');
    const activeItem = document.querySelector('.suggestion-item.active');
    let newActiveItem;

    switch (event.key) {
        case 'ArrowDown':
            if (activeItem) {
                newActiveItem = activeItem.nextElementSibling || suggestionsContainer.firstElementChild;
            } else {
                newActiveItem = suggestionsContainer.firstElementChild;
            }
            break;

        case 'ArrowUp':
            if (activeItem) {
                newActiveItem = activeItem.previousElementSibling || suggestionsContainer.lastElementChild;
            } else {
                newActiveItem = suggestionsContainer.lastElementChild;
            }
            break;

        case 'Enter':
            if (activeItem) {
                activeItem.click();
                suggestionsContainer.style.display = 'none'; // Hide the suggestions list
                event.preventDefault(); // Prevent default to stop any unintended behavior
                return;
            }
            break;
    }

    // Update the active item
    if (newActiveItem) {
        if (activeItem) {
            activeItem.classList.remove('active');
        }
        newActiveItem.classList.add('active');
        event.preventDefault(); // Prevent default to stop any unintended behavior
    }
}


// more

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

var targetNode = document.getElementById('person-info');
var config = { childList: true };

observer.observe(targetNode, config);