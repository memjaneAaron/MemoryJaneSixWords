/*
 * Module for the Six Words functionality, based on the Alexa spec.
 */
var sixWords = (function () {
    // This data object is our connection to the database.
    var data = require("./data.js");

    // When a new session starts, initialize anything that needs initializing.
    function onSessionStarted(sessionStartedRequest, session, context) {
        // TODO Maybe fire up the DB here?
    }

    // Request handlers - launch, intent and ended.
    var requestHandlers = {
        LaunchRequest: function (event, context) {
            // Send a welcome message. Ask if the user wants to listen to a story.
            var welcomeMessage = "Welcome to Six Word Stories. ";
            welcomeMessage += "You can say listen to hear an awesome little six word story.";
            alexaSpeak(welcomeMessage, event.session, context, false);
        },

        IntentRequest: function (event, context) {
            // See if we have an intent to handle the intent we got. If so, call it.
            var intent = event.request.intent,
                intentName = event.request.intent.name,
                intentHandler = intentHandlers[intentName];
            if (intentHandler) {
                console.log('SixWords _onIntent dispatch intent = ' + intentName);
                intentHandler(intent, event.session, context);
            } else {
                throw 'SixWords ERROR Unsupported intent: ' + intentName;
            }
        },

        SessionEndedRequest: function (event, context) {
            // TODO maybe clean up any DB here?
        }
    };

    var intentHandlers = {
        ListenIntent: function (intent, session, context) {
            // Get a story from data.
            data.getRandomStory(function (nextStory, storyDate, storyTime) {
                // Save the storyDate and storyTime to make sure we know which story was read.
                session.attributes.storyDate = storyDate;
                session.attributes.storyTime = storyTime;

                // Read the story, Alexa, ask if they want to up vote it.
                var ratingAnnouncement = ". . . If you liked that story, you can say, up vote.";
                ratingAnnouncement += "Or you can say listen to hear another story.";
                alexaSpeak(nextStory + ratingAnnouncement, session, context, false);
            });
        },
        UpVoteIntent: function (intent, session, context) {
            // If there is a story saved in the session, then we're ready to upvote.
            if (!session.attributes) session.attributes = {};
            if (session.attributes.storyDate && session.attributes.storyTime) {
                data.incrementStoryRating(session.attributes.storyDate, session.attributes.storyTime, function (error) {
                    if (error) { console.log("SixWords _upVoteIntent  ERROR "+error);
                    } else {
                        var upVoteResponse = "Great, I've given the story an up vote. ";
                        upVoteResponse += "Say listen to hear another story.";
                        alexaSpeak(upVoteResponse, session, context, false);
                    }
                });
            } else {
                // If there's no story saved in the session, then just invite them to listen.
                var oopsResponse = "You can say listen to hear a story or create to write your own. ";
                oopsResponse += "Which would you like?";
                alexaSpeak(oopsResponse, session, context, false);
            }
        },
        CreateIntent: function (intent, session, context) {
            // Let's create a story - did the user give us the 6 words we need?
            if (!intent.slots || !intent.slots.Story || !intent.slots.Story.value) {
                // No Story. Let's tell them how to create.
                var noStoryResponse = "Great, let's make a story. Say create followed by your six words.";
                alexaSpeak(noStoryResponse, session, context, false);
            } else {
                // Turn "period" and "comma" into punctuation, and count the length.
                var userStory = intent.slots.Story.value;
                var userStoryArray = userStory.split(" ");
                var userStoryWordCount = userStoryArray.length;

                // Let's see if the user included any punctuation.
                var userStoryArrayWithoutPunctuation = punctuationFixer(userStoryArray.splice(0));
                var userStoryArrayWithoutPunctuationCount = userStoryArrayWithoutPunctuation.length;
                if (userStoryWordCount != userStoryArrayWithoutPunctuationCount &&
                    userStoryArrayWithoutPunctuationCount == 6) {
                    // They did use punctuation, so use the punctuation corrected values.
                    userStoryWordCount = userStoryArrayWithoutPunctuationCount;
                    userStory = userStoryArrayWithoutPunctuation.join(" ");
                }

                if (userStoryWordCount > 6 || userStoryWordCount < 6) {
                    // Oops, they said too many or not enough words. Let's repeat what they said and tell
                    // them that they have to give us exactly 6 words.
                    var oopsResponse = "Oops. I heard you try to create the following story: "+userStory;
                    oopsResponse += " . But our stories require exactly 6 words. ";
                    oopsResponse += "Try again, say create followed by your six words.";
                    alexaSpeak(oopsResponse, session, context, false);
                } else {
                    // They gave us 6 words, so now we save it to the session attributes.
                    if (!session.attributes) session.attributes = {};
                    session.attributes.userStory = userStory;

                    // And repeat it back to them to confirm that we heard them correctly.
                    var validWordsResponse = "Cool story! I just want to confirm I heard it right. Did you say ";
                    validWordsResponse += userStory+" ?";
                    alexaSpeak(validWordsResponse, session, context, false);
                }
            }
        },
        YesIntent: function(intent, session, context) {
            // If there isn't a story in the attributes, then this intent is not valid, give them some instructions.
            if (!session.attributes.userStory || session.attributes.userStory.length == 0) {
                var oopsResponse = "You can say listen to hear a story or create to write your own. ";
                oopsResponse += "Which would you like?";
                alexaSpeak(oopsResponse, session, context, false);
            } else {
                // We heard the story right, so store it in the DB
                data.putNewStory(session.user.userId, session.attributes.userStory, function(putStoryError) {
                    if (putStoryError) console.log("SixWords _yesIntent  ERROR "+putStoryError);
                    else {
                        // Remove the story from the session attributes.
                        session.attributes.userStory = undefined;

                        // And ask them to write or listen to another one.
                        var confirmationResponse = "Coolio! Your story is saved. I can't wait to tell it. ";
                        confirmationResponse += "What would you like to do next. "
                        confirmationResponse += "Create another story or listen to one?";
                        alexaSpeak(confirmationResponse, session, context, false);
                    }
                });
            }
        },
        NoIntent: function(intent, session, context) {
            // If there isn't a story in the attributes, then this intent is not valid, give them some instructions.
            if (!session.attributes.userStory || session.attributes.userStory.length == 0) {
                var oopsResponse = "You can say listen to hear a story or create to write your own. ";
                oopsResponse += "Which would you like?";
                alexaSpeak(oopsResponse, session, context, false);
            } else {
                // We didn't hear the story right, so ask them to tell it to us again.
                session.attributes.userStory = undefined;

                var confirmationResponse = "Oops, sorry about that. Let's try again. ";
                confirmationResponse += "Say create followed by your six words.";
                alexaSpeak(confirmationResponse, session, context, false);
            }
        },
        QuitIntent: function(intent, session, context) {
            alexaSpeak("Goodbye", session, context, true);
        }
    };

    /*
     * Helper function to build an Alexa response and send it to her via context.succeed.
     */
    function alexaSpeak(message, session, context, endSession) {
        console.log("(*) Alexa Says: "+message);

        // Create the response for Alexa.
        var alexaResponse = { version: "1.0",
            response: {
                outputSpeech: { type: 'PlainText', text: message },
                // for now, just reprompt with the same message. TODO make this accept a unique reprompt?
                reprompt: { type: 'PlainText', text: message },
                shouldEndSession: endSession
            }
        };

        // Add the session attributes to the response.
        alexaResponse.sessionAttributes = session.attributes;

        // Send it to Alexa.
        context.succeed(alexaResponse);
    }

    /*
     * The fullStory parameter is an array of the words of a sentence. This function replaces all instances of
     * "period" and "comma" with the punctuation mark on the previous word. It discards any punctuation words
     * at the beginning of the sentence. It returns a new array with the updated words.
     */
    function punctuationFixer (storyArray) {
        for (i = 0; i < storyArray.length; i++) {
            if (storyArray[i].toLowerCase() == "period" || storyArray[i].toLowerCase() == "comma") {
                if (i != 0) {
                    // This is not the first item, so append the punctuation to the previous word.
                    var punctuation = ".";
                    if (storyArray[i].toLowerCase() == "comma") punctuation = ",";
                    storyArray[i-1] = storyArray[i-1].concat(punctuation);
                }

                // Remove the punctuation from the array. and stay on the current word.
                storyArray.splice(i, 1);
                i--;
            }
        }
        return storyArray;
    }

    return {
        /*
         * The only public function of the module. Called by the handler, it executes the Alexa Skill.
         */
        execute: function(event, context) {
            // TODO do we want to check the AppID here?

            // If the session is new, initialize it.
            if (event.session.new) {
                onSessionStarted(event.request, event.session, context);
            }

            // Route the request to the right handler.
            requestHandlers[event.request.type](event, context);
        }
    }
}) ();

/**
 * This is what gets called by Lambda with each Alexa interaction.
 * @param event
 * @param context
 */
exports.handler = function (event, context) {
    console.log("SixWordsIndex _handler  START");

    // Create an instance of the SixWords skill and execute it.
    sixWords.execute(event, context);
    console.log("SixWordsIndex _handler  DONE");
};
