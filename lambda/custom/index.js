/* eslint-disable  func-names */
/* eslint-disable  no-console */

const Alexa = require('ask-sdk-core');
const axios = require('axios');
const zipcodes = require('zipcodes');
const Parser = require('rss-parser');
const _ = require('lodash');

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
      resolve(_.filter(feed.items, fire => !!fire.content.trim()));
    }
  });
});

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AllFiresIntent'
    );
  },
  async handle(handlerInput) {
    let speechText = 'The following fires are ongoing: ';

    const data = await getFireData;
    _.each(data, (fire, index) => {
      speechText += `Fire #${index + 1}: ${fire.title.substr(0, fire.title.indexOf(')') + 1)}\n`;
    });

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('California Fires', speechText)
      .getResponse();
  }
};

const CountyFireIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'CountyFireIntent'
    );
  },
  async handle(handlerInput) {
    const data = await getFireData;
    const fire = _.find(data, fireData =>
      fireData.title
        .toLowerCase()
        .includes(handlerInput.requestEnvelope.request.intent.slots.County.value.toLowerCase())
    );

    const speechText = !!fire
      ? `${fire.title}: ${fire.content.replace(/(\r\n|\n|\r)/gm, ' ')}`
      : `No fires in ${handlerInput.requestEnvelope.request.intent.slots.County.value}`;

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('California Fires', speechText)
      .getResponse();
  }
};

const IndexFireIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'IndexFireIntent'
    );
  },
  async handle(handlerInput) {
    const data = await getFireData;
    const fire = data[handlerInput.requestEnvelope.request.intent.slots.Index.value - 1];

    const speechText = !!fire
      ? `Fire #${handlerInput.requestEnvelope.request.intent.slots.Index.value}: ${
          fire.title
        }: ${fire.content.replace(/(\r\n|\n|\r)/gm, ' ')}`
      : `Fire number ${
          handlerInput.requestEnvelope.request.intent.slots.Index.value
        } does not exist`;

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('California Fires', speechText)
      .getResponse();
  }
};

const LocalFiresIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'LaunchRequest' ||
      (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
        handlerInput.requestEnvelope.request.intent.name === 'LocalFiresIntent')
    );
  },
  async handle(handlerInput) {
    let speechText = '';
    let needsPerms = false;

    try {
      const response = await axios.get(
        `https://api.amazonalexa.com/v1/devices/${
          handlerInput.requestEnvelope.context.System.device.deviceId
        }/settings/address/countryAndPostalCode`,
        {
          headers: {
            Authorization: `Bearer ${handlerInput.requestEnvelope.context.System.apiAccessToken}`
          }
        }
      );

      const myZip = await response.data.postalCode;
      const data = await getFireData;

      _(data)
        .map(value => {
          const loc = zipcodes.lookupByCoords(value.lat, value.long);
          if (loc !== null) {
            const distance = zipcodes.distance(myZip, loc.zip);
            if (distance <= 30) {
              return {
                distance,
                title: value.title,
                content: value.content.replace(/(\r\n|\n|\r)/gm, ' ')
              };
            }
          }
          return null;
        })
        .without(null)
        .sortBy(['distance'])
        .each(fire => {
          speechText +=
            fire.distance !== null
              ? `${fire.distance} miles away: ${fire.title}: ${fire.content}\n`
              : '';
        });

      const myZipInfo = zipcodes.lookup(myZip);

      speechText = speechText
        ? `The following fires are within 30 miles of ${myZipInfo.city}, ${
            myZipInfo.state
          }: ${speechText}`
        : `There are no fires within 30 miles of ${myZipInfo.city}, ${myZipInfo.state}.`;
    } catch (err) {
      console.error(err);
      if (err.status === 403) {
        speechText =
          'Error: you have not granted the location permission to the California Fires app. Please do so through the new card in your Alexa app.';
        needsPerms = true;
      }
    }

    speechText +=
      '\n Say "get all fires" to return a list of all fires, or "help" for more commands';

    const response = handlerInput.responseBuilder.speak(speechText).reprompt(speechText);
    return needsPerms
      ? response
          .withAskForPermissionsConsentCard([
            'read::alexa:device:all:address:country_and_postal_code'
          ])
          .getResponse()
      : response.withSimpleCard('California Fires', speechText).getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speechText =
      'Try saying "get all fires" to get brief information about all fires,\n' +
      '"is there a fire near me" to get fires close to you,\n' +
      '"is there a fire in (county name)" to get information about a specific county,\n' +
      'or "tell me about fire number (index) to get information about a specific fire number [from "get all fires"]';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('California Fires', speechText)
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent' ||
        handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent')
    );
  },
  handle(handlerInput) {
    const speechText = 'Got it';

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('California Fires', speechText)
      .getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak("Sorry, I can't understand the command. Please say again.")
      .reprompt("Sorry, I can't understand the command. Please say again.")
      .getResponse();
  }
};

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    CountyFireIntentHandler,
    IndexFireIntentHandler,
    LocalFiresIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
