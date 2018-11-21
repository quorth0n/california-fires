const fs = require('fs');
const Parser = require('rss-parser');
const fileName = './models/en-US.json';
let model = require(fileName);

const getFireData = new Promise((resolve, reject) => {
  const parser = new Parser({
    headers: {
      Accept:
        'application/rss+xml, application/rdf+xml;q=0.8, application/atom+xml;q=0.6, application/xml;q=0.4, text/xml;q=0.4'
    },
    customFields: {
      item: [['geo:lat', 'lat'], ['geo:long', 'long']]
    }
  });

  parser.parseURL('http://www.fire.ca.gov/rss/rss.xml', (err, feed) => {
    if (err) {
      reject(err);
    } else {
      resolve(feed.items);
    }
  });
});

const getTitles = getFireData.then(fireData =>
  fireData.map(fire => ({ name: { value: fire.title.substr(0, fire.title.indexOf('(')).trim() } }))
);

getTitles.then(titles => {
  model.interactionModel.languageModel.types[0].values = titles;

  fs.writeFile(fileName, JSON.stringify(model, null, 2), function(err) {
    if (err) return console.log(err);
    console.log(JSON.stringify(model, null, 2));
    console.log(`\nwriting to ${fileName}`);
  });
});
