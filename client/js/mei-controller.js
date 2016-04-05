var initTop, initLeft;
var pageRef;

var facsPoints = {}; //stores zone to when info
var facsTimes = []; //stores times as ints
var facsIntToString = {}; //dict to change facsTimes to facsPoints keys
var pageRefs = [];
var highlightMode = false;
var highlightInterval;
var intervalIsRunning = false;
var nextFacsTime = -1;
var prevHighlightSelector;

var meiEditor;
var activeWAP, waveformAudioPlayers = {};
var divaData;
var vidaData;
var editable = false;

var divaSettings = {
    enableAutoHeight: true,
    fixedHeightGrid: false,
    iipServerURL: "http://localhost/fcgi-bin/iipsrv.fcgi",
    objectData: "diva_data/holst2Tiff.json",
    imageDir: "/srv/images/holst2Tiff/",
    // iipServerURL: "http://diva.simssa.ca/fcgi-bin/iipsrv.fcgi",
    // objectData: "/salzinnes.json",
    // imageDir: "/srv/images/cantus/cdn-hsmu-m2149l4/",
    enableAutoscroll: true,
    disableAutoscrollPrefs: true,
    disableManualScroll: true,
    enableCanvas: true,
    enableDownload: true,
    enableHighlight: true,
    enableAutoTitle: false
    //verticallyOriented: false
};

var element = "#mei";
var meixSettings = 
{
    'meiEditorLocation': 'js/meix.js/',
    'headless': true,
    'divaInstance': divaData,
    'skipXMLValidator': true,
    'meiToIgnore': ['system'],
    'initializeWithFiles': ['mei_data/bach.mei', 'mei_data/krebs.mei']
};
var plugins = ["js/meix.js/js/local/plugins/meiEditorZoneDisplay.js"];

var vidaSettings = 
{
    horizontallyOriented: 0,
    fileOnLoadIsURL: false,
    workerLocation: "/js/vida.js/verovioWorker.js"
};

$(document).ready(function() {

    meiEditor = new MeiEditor(element, meixSettings, plugins);
    $(window).on('meiEditorLoaded', function(){
        meiEditor = $("#mei").data('AceMeiEditor');
        var titles = meiEditor.getPageTitles();
        for(var tIdx = 0; tIdx < titles.length; tIdx++)
        {
            var avIdx = 0;
            var pageData = meiEditor.getPageData(titles[tIdx]);
            var avFiles = pageData.parsed.querySelectorAll("avFile");
            var element = pageData.el;
            element.innerHTML = "";
            for (avIdx; avIdx < avFiles.length; avIdx++)
            {
                var label = avFiles[avIdx].getAttribute('label');
                var location = avFiles[avIdx].getAttribute('target');
                element.innerHTML += "<div class='waveform' data-index='" + avIdx + "'></div>";
                var activeWaveform = element.querySelector('.waveform[data-index="' + avIdx + '"]');
                $(activeWaveform).wap({
                    'editMode': editable,
                    'fileOnLoad': location,
                    'title': label
                });

                waveformAudioPlayers[activeWaveform.getAttribute('id')] = $(activeWaveform).data('wap');
            } 

            avIdx++;
            element.innerHTML += "<div class='waveform' data-index='" + avIdx + "'></div>";
            activeWaveform = element.querySelector('.waveform[data-index="' + avIdx + '"]');
            $(activeWaveform).wap({
                'editMode': editable,
                'title': 'Add your own file'
            });
            
            waveformAudioPlayers[activeWaveform.getAttribute('id')] = $(activeWaveform).data('wap');
        }

        if (editable)
        {
            $(".playback-checkbox").on('change', function(e)
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

                    if(activeWAP.isPlaying() && highlightMode)
                    {
                        updateHighlights();
                    }
                    else if (!highlightMode)
                    {
                        turnOffHighlights();
                    }
                });
            });
            $(".playback-checkbox").after("<button onclick='regenerateTimePoints()'>Reload MEI</button>");
        }

        //have to prevent space scroll on keydown rather than keyup
        $(window).on('keydown', function(e)
        {
            if (e.keyCode == 32) e.preventDefault();
        });

        $(window).on('keyup', function(e)
        {
            if (e.keyCode == 32) activeWAP.spaceInput();
        });

        $(".pause-button").on('click', function(e)
        {
            if (activeWAP === waveformAudioPlayers[$(e.target).closest(".waveform").attr('id')]
                && (!editable || (editable && highlightMode))) turnOffHighlights();

            activeWAP.pauseAudioPlayback(true);
        });

        $(".play-button").on('click', function(e)
        {
            updateActiveWAP(e);
            if (!editable || (editable && highlightMode)) updateHighlights();
            activeWAP.startAudioPlayback();
        });

        meiEditor.events.subscribe("ActivePageChanged", function(filename) {
            turnOffHighlights();

            var pageData = meiEditor.getPageData(filename);
            var waveforms = pageData.el.querySelectorAll(".waveform");
            for (var wIdx = 0; wIdx < waveforms.length; wIdx++)
                waveformAudioPlayers[waveforms[wIdx].getAttribute('id')].resizeComponents();

            if (pageData.parsed.querySelector("graphic"))
            {
                console.log("would switch Diva");
            }
            else 
            {
                console.log("would switch Vida", vidaData);
                if (vidaData) vidaData.changeMusic(meiEditor.getPageData(filename).raw);
            }
        });

        //we need the facs points to start and this will update zones
        regenerateTimePoints();

        mei.Events.subscribe("JumpedToTime", updateHighlights);
        mei.Events.subscribe("JumpedToTime", updateActiveWAP);
    });
});

// Triggers a call to publishZones and runs onUpdate on the results
var meiUpdateStartFunction;
var meiUpdateEndFunction;
var updateHighlights;
var endHandler;
function regenerateTimePoints()
{    
    var parsed = meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed;
    if (meiEditor.isActivePageLinked())
    {
        switchToRenderer("diva", parsed);
        meiEditor.events.subscribe('ZonesWereUpdated', divaUpdate);
        meiEditor.events.publish('UpdateZones');
    }
    else
    {
        switchToRenderer("vida", parsed);
        vidaUpdate(parsed);
    }
}

var updateActiveWAP = function(e, canvas)
{
    turnOffHighlights();

    var target = canvas ? canvas : e.target;
    var filename = $(target).closest(".mei-editor-pane").attr('data-originalname');
    activeWAP = waveformAudioPlayers[$(target).closest(".waveform").attr('id')];

    vidaUpdate(meiEditor.getPageData(filename).parsed);
};

var switchToRenderer = function(which, newFile)
{
    if (which === "diva" && !divaData)
    {
        if(vidaData) vidaData.destroy();
        $('#renderer').diva(divaSettings);
        vidaData = null;
        divaData = $('#renderer').data('diva');
        meixSettings.divaInstance = divaData;
        updateHighlights = updateDivaHighlights;

        meiUpdateStartFunction = function(time) 
        {
            meiEditor.localLog("Got a request for a zone at "+ time);
            meiEditor.startNewHighlight();
            endHandler = meiEditor.events.subscribe('NewZone', meiUpdateEndFunction);
        };
        meiUpdateEndFunction = function(page, prevZone, newZone, uuid)
        {
            meiEditor.events.unsubscribe(endHandler);
            regenerateTimePoints();
            insertNewTimepoint(meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed, uuid);
            activeWAP.startAudioPlayback();
        };
        return "diva";
    }

    if (which === "vida" && !vidaData)
    {
        if (divaData) divaData.destroy();
        vidaSettings.fileOnLoad = newFile.children[0].outerHTML;
        $('#renderer').vida(vidaSettings);
        divaData = null;
        vidaData = $('#renderer').data('vida');
        updateHighlights = updateVidaHighlights;

        meiUpdateStartFunction = function(time) 
        {
            meiEditor.localLog("Got a request for a zone at "+ time);
            endHandler = mei.Events.subscribe('MeasureClicked', meiUpdateEndFunction);
        };
        meiUpdateEndFunction = function(measureObj)
        {
            mei.Events.unsubscribe(endHandler);
            regenerateTimePoints();
            insertNewTimepoint(meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed, measureObj.attr('id'));
            activeWAP.startAudioPlayback();
        };

        return "vida";
    }
};

var insertNewTimepoint = function(parsed, targetUUID)
{
    var timelines = parsed.querySelectorAll("*|timeline");
    var activeTimeline;
    if (timelines.length === 0)
    {
        var origin = document.createElement("when");
        var originID = genUUID();
        origin.setAttribute('xml:id', originID);
        origin.setAttribute('absolute', 0);

        var music = parsed.querySelector("*|music");
        activeTimeline = document.createElement("timeline");
        activeTimeline.setAttribute('xml:id', genUUID());
        activeTimeline.setAttribute('origin', originID);
        music.appendChild(activeTimeline);
        activeTimeline.appendChild(origin);
    }
    else
    {
        // Switch based off audio file name?
        activeTimeline = timelines[0];
    }

    var newWhen = document.createElement("when");
    var whenUUID = genUUID();
    newWhen.setAttribute('xml:id', whenUUID);
    newWhen.setAttribute('absolute', activeWAP.currentTimeToPlaybackTime());
    activeTimeline.appendChild(newWhen);

    var targetObj = parsed.querySelector("*[*|id='" + targetUUID + "']");
    targetObj.setAttribute('when', whenUUID);
    rewriteAce(meiEditor.getPageData(meiEditor.getActivePageTitle()));
};

var divaUpdate = function(facsDict)
{
    facsPoints = {};

    var pageTitles = meiEditor.getLinkedPageTitles();
    var divaPages = Object.keys(pageTitles);
    var idx = pageTitles.length;

    //create facsPoints, a dict of {timestamp string: [highlightID1, highlightID2...]}
    while(idx--)
    {
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

    meiEditor.events.unsubscribe('ZonesWereUpdated', divaUpdate);
};

var vidaUpdate = function(parsed)
{
    if (!activeWAP) return;
    facsPoints = {};
    var facsPointsStaging = {};

    // Get a list of <when> timepoints and order them
    var parsed = meiEditor.getPageData(meiEditor.getActivePageTitle()).parsed;
    var avFile = parsed.querySelector("avFile[target='" + activeWAP.getFilename() + "']").getAttribute("id");
    var whenPoints = parsed.querySelectorAll("timeline[avref='" + avFile + "'] when");
    var whenIdx = whenPoints.length;

    while(whenIdx--)
    {
        var thisWhen = whenPoints[whenIdx];
        var whenID = thisWhen.getAttribute("xml:id");
        var whenAbs = thisWhen.getAttribute('absolute');
        var floatWhen = (whenAbs.indexOf(":") > 0 ? stringTimeToFloat(whenAbs) : parseFloat(whenAbs));
        if (parsed.querySelector("[*|id='" + thisWhen.getAttribute('data') + "']"))
            facsPointsStaging[floatWhen] = "#" + thisWhen.getAttribute('data');
    }

    // Make sure they're in ascending order to speed up calculations later
    facsInts = Object.keys(facsPointsStaging);
    facsInts.sort(function(a, b)
    {
        return parseFloat(a) - parseFloat(b);
    });
    
    for (var idx = 0; idx < facsInts.length; idx++)
        facsPoints[parseFloat(facsInts[idx])] = facsPointsStaging[facsInts[idx]];
    facsTimes = Object.keys(facsPoints);
};

function turnOffHighlights()
{
    window.clearInterval(highlightInterval);
    intervalIsRunning = false;
    nextFacsTime = 0;
    
    for (var playerID in waveformAudioPlayers)
        waveformAudioPlayers[playerID].pauseAudioPlayback(true);
}

function updateDivaHighlights(overrideTime)
{
    /**
     * TODO: reimplement
    var currentFacsTime = facsTimes[nextFacsTimeIdx];
    var string = facsIntToString[currentFacsTime];
    meiEditor.deselectAllHighlights();

    for (var highlight in facsPoints[string])
    {
        highlightID = facsPoints[string][highlight];
        meiEditor.selectHighlight("#" + highlightID);
    }

    nextFacsTimeIdx++;
    var nextFacsTime = facsTimes[nextFacsTimeIdx];
    */

    if (!intervalIsRunning)
    {
        highlightInterval = window.setInterval(updateHighlights, 100);
        intervalIsRunning = true;
    }
}

function updateVidaHighlights(overrideTime)
{
    var activeAudioTime = (parseFloat(overrideTime) || activeWAP.currentTimeToPlaybackTime());
    // if we haven't passed the next update, forget this and just wait until the next iteration
    if ((overrideTime === undefined) && (activeAudioTime < nextFacsTime)) return;

    // find the next greatest time and store it
    var facsIdx = 0;
    for (facsIdx; facsIdx < facsTimes.length; facsIdx++)
        if (parseFloat(facsTimes[facsIdx]) > activeAudioTime)
        {
            nextFacsTime = facsTimes[facsIdx];
            break;
        }
    // Nothing left.
    if(facsIdx == facsTimes.length)
    {
        nextFacsTime === Infinity;
        return;
    }

    // track which highlights need to be added
    var activeFacsTime = facsTimes[facsIdx - 1];
    var activeHighlight = document.querySelector(facsPoints[activeFacsTime]);

    // If there was a previous highlight, paint it black
    if (prevHighlightSelector) $(prevHighlightSelector).find("*").css({
            "fill": "#000",
            "stroke": "#000"
        });

    // Paint the current highlight red and scroll to it
    $(activeHighlight).find("*").css({
        "fill": "#f00",
        "stroke": "#f00"
    });
    prevHighlightSelector = activeHighlight;
    vidaData.scrollToObject(facsPoints[activeFacsTime]);

    if (!intervalIsRunning)
    {
        highlightInterval = window.setInterval(updateHighlights, 100);
        intervalIsRunning = true;
    }
}

function createDefaultMEI()
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
    pageRef.session.doc.insertLines(0, defaultMEIString);
}
