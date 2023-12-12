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


                    const statusClass = isDeceased ? 'dead' : 'alive';
                    const imgId = isDeceased ? 'dead' : 'alive';
                    const imgAlt = isDeceased ? 'picture representing death' : 'picture representing life';
                    const status  = isDeceased ? 'DEAD' : 'ALIVE';

                    const specialPersonIds = [ // Add special person IDs here
                    'Q1740276'/*Geordie Walker*/, 
                    'Q1361323'/*Jazz Coleman*/
                    ]; 

                    let htmlContent = `
                        <div id="status" class="${statusClass}">
                            <p><a href="https://www.wikidata.org/wiki/${personId}" target="_blank">${personLabel}</a> is ${status}</p>
                            <!--<p><strong>Date of Birth:</strong> ${formattedDOB}</p>
                            <p><strong>Date of Death:</strong> ${formattedDOD}</p>
                            <p><strong>Gender:</strong> ${gender}</p>-->
                            <!-- Additional content will be inserted here -->
                            <img id="${imgId}" class="${statusClass}" alt="${imgAlt}" src="${imgSrc}">
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

function autocompleteSearch() {
    const name = document.getElementById('search-box').value;
    if (name.length < 3) {
        document.getElementById('suggestions').style.display = 'none';
        return;
    }

    const script = document.createElement('script');
    script.src = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&uselang=en&type=item&continue=0&callback=handleAutocompleteResponse`;
    document.head.appendChild(script);
    document.head.removeChild(script);
}


function handleAutocompleteResponse(response) {
    let suggestionsHTML = '';
    response.search.forEach(item => {
        let displayText = item.label;
        if (item.description) {
            displayText += ` - ${item.description}`;
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