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
    SELECT ?dateOfBirth ?dateOfDeath 
           (YEAR(?dateOfDeath) - YEAR(?dateOfBirth) AS ?ageAtDeath)
    WHERE {
      wd:${personId} wdt:P569 ?dateOfBirth;
                    OPTIONAL { wd:${personId} wdt:P570 ?dateOfDeath. }
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
            const wikidataUrl = `https://www.wikidata.org/wiki/${personId}`;

            fetch(detailsUrl)
            .then(response => response.json())
            .then(data => {
                const personInfo = data.results.bindings[0];
                const formattedDOB = formatDate(personInfo.dateOfBirth.value);
                const isDeceased = personInfo.dateOfDeath; 
                const formattedDOD = isDeceased ? formatDate(personInfo.dateOfDeath.value) : 'N/A';
                const statusClass = isDeceased ? 'dead' : 'alive';
                const imgSrc = isDeceased ? '/img/dodo.png' : '/img/turtle.png';
                const imgId = isDeceased ? 'dodo' : 'turtle';
                const imgAlt = isDeceased ? 'picture of a dodo' : 'picture of a turtle';
                const status  = isDeceased ? 'DEAD' : 'ALIVE';
                
                const htmlContent = `
                    <div class="${statusClass}">
                        <!--<p><strong>Name:</strong> <a href="${wikidataUrl}" target="_blank">${personLabel}</a></p>
                        <p><strong>Date of Birth:</strong> ${formattedDOB}</p>
                        <p><strong>Date of Death:</strong> ${formattedDOD}</p>
                        <p><strong>Age at Death:</strong> ${personInfo.ageAtDeath ? personInfo.ageAtDeath.value : 'N/A'}</p>-->
                        <p><a href="${wikidataUrl}" target="_blank">${personLabel}</a> is ${status}</p>
                        <img id="${imgId}" class="${statusClass}" alt="${imgAlt}" src="${imgSrc}">
                    </div>
                `;

                document.getElementById('person-info').innerHTML = htmlContent;
            });
        } else {
            document.getElementById('person-info').innerHTML = "<p>English label not found.</p>";
        }
    })
    .catch(error => {
        console.error('Error fetching label:', error);
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

