var initTop, initLeft;
var pageRef;

var facsPoints = {}; //stores zone to when info
var facsTimes = []; //stores times as ints
var facsIntToString = {}; //dict to change facsTimes to facsPoints keys
var pageRefs = [];
var highlightMode = false;
var highlightInterval;
var nextFacsTimeIdx = 0;

function initializeMEI()
{    
    var timeUUID = genUUID();
    var defaultMEIString = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<mei xmlns="http://www.music-encoding.org/ns/mei" xml:id="' + genUUID() + '" meiversion="2013">',
    '  <meiHead xml:id="' + genUUID() + '">',
    '    <fileDesc xml:id="' + genUUID() + '">',
    '      <titleStmt xml:id="' + genUUID() + '">',
    '        <title xml:id="' + genUUID() + '"/>',
    '      </titleStmt>',
    '      <pubStmt xml:id="' + genUUID() + '"/>',
    '    </fileDesc>',
    '  </meiHead>',
    '  <music xml:id="' + genUUID() + '">',
    '    <timeline xml:id="' + genUUID() + '" origin="' + timeUUID + '">',
    '      <when xml:id="' + timeUUID + '" absolute="00:00:00"/>',
    '    </timeline>',
    '    <facsimile xml:id="' + genUUID() + '">'];
    
    var totalPages = divaData.getSettings().numPages;
    for(var idx = 0; idx < totalPages; idx++)
    {
        pageUUID = genUUID();
        pageRefs[idx] = pageUUID;
        defaultMEIString.push('      <surface n="' + idx + '" xml:id="' + pageUUID + '">');
        defaultMEIString.push('      </surface>');
    }

    var meiAppend = ['    </facsimile>',
    '  </music>',
    '</mei>'];

    for (var line in meiAppend) defaultMEIString.push(meiAppend[line]);

    pageRef = meiEditor.getPageData(meiEditor.getActivePageTitle());
    
    if(!meixSettings.hasOwnProperty('initializeWithFile'))
        pageRef.session.doc.insertLines(0, defaultMEIString);
    
    //meiEditor.events.subscribe("PageEdited", regenerateFacsPoints);
    $("#playback-checkbox").on('change', function(e)
    {
        $("#autoscroll-wrapper").css('display', ($("#playback-checkbox").is(":checked") ? "inline" : "none"));
        if(!$("#playback-checkbox").is(":checked"))
        {
            turnOffHighlights();
        }

        $("#autoscroll-checkbox").on('change', function(e)
        {
            if(highlightMode != $("#autoscroll-checkbox").is(":checked"))
            {
                highlightMode = $("#autoscroll-checkbox").is(":checked");
            }
            if(waveformAudioPlayer.isPlaying() && highlightMode)
            {
                turnOnHighlights();
            }
            else if (!highlightMode)
            {
                turnOffHighlights();
            }
        });
    });
    $("#playback-checkbox").after("<button onclick='regenerateFacsPoints()'>Reload MEI</button>");
    $("#pause-button").on('click', function()
    {
        if (highlightMode) turnOffHighlights();
    });

    $("#play-button").on('click', function()
    {
        if (highlightMode) turnOnHighlights();
    });

    //we need the facs points to start and this will update zones
    regenerateFacsPoints();
}

function regenerateFacsPoints()
{
    var onUpdate = function(facsDict)
    {
        facsPoints = {};

        var pageTitles = meiEditor.getLinkedPageTitles();
        var divaIndexes = Object.keys(pageTitles);
        var idx = divaIndexes.length;

        //create facsPoints, a dict of {timestamp string: [highlightID1, highlightID2...]}
        while(idx--)
        {
            var divaIdx = divaIndexes[idx];
            var curTitle = pageTitles[divaIdx];
            var parsed = meiEditor.getPageData(curTitle).parsed;

            var whenPoints = parsed.querySelectorAll("when");
            var whenIdx = whenPoints.length;

            while(whenIdx--)
            {
                var thisWhen = whenPoints[whenIdx];
                var whenID = thisWhen.getAttribute("xml:id");
                var whenAbs = thisWhen.getAttribute('absolute');
                facsPoints[whenAbs] = [];

                var notes = parsed.querySelectorAll("[*|when='" + whenID + "']");
                var noteIdx = notes.length;

                while(noteIdx--)
                {
                    facsPoints[whenAbs].push(notes[noteIdx].getAttribute('facs'));
                }

            }
        }

        //create facsIntToString, a dict of {facsTimeInt: facsTimeString} where facsTimeString is a key in facsPoints
        facsIntToString = {};

        var facsIntToStringPrep = {};
        var facsStrings = Object.keys(facsPoints);
        var facsInts = [];
        var curString, curFloat;
        for (idx = 0; idx < facsStrings.length; idx++)
        {
            curString = facsStrings[idx];
            curFloat = stringTimeToFloat(curString);
            facsIntToStringPrep[curFloat] = curString;
            facsInts.push(curFloat);
        }

        facsInts.sort(function(a, b)
        {
            return parseFloat(a) - parseFloat(b);
        });

        for (idx = 0; idx < facsInts.length; idx++)
        {
            var compFloat = facsInts[idx];
            for (curFloat in facsIntToStringPrep)
            {
                curString = facsIntToStringPrep[curFloat];
                if (compFloat == curFloat && facsTimes.indexOf(compFloat) == -1)
                {
                    facsTimes.push(compFloat);
                    facsIntToString[compFloat] = curString;
                    break;
                }
            }
        }

        meiEditor.events.unsubscribe('ZonesWereUpdated', onUpdate);
    };
    
    meiEditor.events.subscribe('ZonesWereUpdated', onUpdate);
    meiEditor.events.publish('UpdateZones');
}

function stringTimeToFloat(time)
{
    var timeSplit = time.split(":");
    return parseInt(timeSplit[0], 10)*3600 + parseInt(timeSplit[1], 10)*60 + parseFloat(timeSplit[2]);
}

function updateHighlights()
{
    var currentFacsTime = facsTimes[nextFacsTimeIdx]
    var string = facsIntToString[currentFacsTime];
    meiEditor.deselectAllHighlights();

    for (var highlight in facsPoints[string])
    {
        highlightID = facsPoints[string][highlight];
        meiEditor.selectHighlight("#" + highlightID);
    }

    nextFacsTimeIdx++;
    var nextFacsTime = facsTimes[nextFacsTimeIdx];

    var msDifference = (nextFacsTime - currentFacsTime) * 1000;

    window.clearInterval(highlightInterval);
    highlightInterval = window.setInterval(updateHighlights, msDifference);
}

function turnOnHighlights()
{
    updateHighlights();
}

function turnOffHighlights()
{
    window.clearInterval(highlightInterval);
}

function endMeiAppend(editorRef, prevRef, nextRef, newRef)
{
    meiEditor.events.unsubscribe('NewZone', endMeiAppend);
    regenerateFacsPoints();
    waveformAudioPlayer.startAudioPlayback();
}

function startMeiAppend(time)
{
    meiEditor.localLog("Got a request for a zone at "+ time);
    meiEditor.startNewHighlight();
    meiEditor.events.subscribe('NewZone', endMeiAppend);
}