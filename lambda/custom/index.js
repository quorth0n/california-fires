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
      resolve(feed.items);
    }
  });
});

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'LaunchRequest' ||
      (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
        handlerInput.requestEnvelope.request.intent.name === 'AllFiresIntent')
    );
  },
  async handle(handlerInput) {
    let speechText = 'The following fires are ongoing: ';

    const data = await getFireData;
    _.each(data, fire => {
      speechText += `${fire.title.substr(0, fire.title.indexOf(')') + 1)}\n`;
    });

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('California Fires', speechText)
      .getResponse();
  }
};

const SelectFireIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'SelectFireIntent'
    );
  },
  async handle(handlerInput) {
    const data = await getFireData;
    const fire = _.find(data, fire =>
      fire.title
        .toLowerCase()
        .includes(handlerInput.requestEnvelope.request.intent.slots.Fire.value)
    );

    const speechText = !!fire
      ? `${fire.title}: ${fire.content}`
      : `${handlerInput.requestEnvelope.request.intent.slots.Fire.value} could not be found`;

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
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'LocalFiresIntent'
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

      const obj = [];
      _(data)
        .map(value => {
          const loc = zipcodes.lookupByCoords(value.lat, value.long);
          if (!!loc) {
            const distance = zipcodes.distance(myZip, loc.zip);
            return distance <= 30
              ? obj.push({
                  distance: distance,
                  title: value.title,
                  content: value.content.replace(/(\r\n\t|\n|\r\t)/gm, '')
                })
              : null;
          }
        })
        .value();

      _(obj)
        .sortBy(['distance'])
        .each(fire => {
          speechText +=
            fire.distance !== null
              ? `${fire.distance} miles away: ${fire.title}: ${fire.content}\n`
              : '';
        });
    } catch (err) {
      console.error(err);
      if (err.status === 403) {
        speechText =
          'Error: you have not granted the location permission to the California Fires app. Please do so through the new card in your Alexa app.';
        needsPerms = true;
      }
    }

    speechText = speechText
      ? `The following fires are within 30 miles of you: ${speechText}`
      : 'There are no fires within 30 miles of you.';

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
      'Try saying "check for fires" to get brief information about all fires,' +
      '"check for local fires" to get fires close to you, ' +
      'or "tell me about [fire name]" to get information about a specific fire';

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
    SelectFireIntentHandler,
    LocalFiresIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
