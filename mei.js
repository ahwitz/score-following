var lut = []; for (var i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }
function genUUID()
{
	var d0 = Math.random()*0xffffffff|0;
	var d1 = Math.random()*0xffffffff|0;
	var d2 = Math.random()*0xffffffff|0;
	var d3 = Math.random()*0xffffffff|0;
	return 'm-' + lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
	lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
	lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
	lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
}

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

function parseXMLLine(text)
{
	var splits = text.split(" ");
	var returnDict = {};
	var returnDictKey;
	splits[splits.length - 1] = splits[splits.length - 1].slice(0, -2);
	for (idx in splits)
	{
		curSplit = splits[idx];

		if(!curSplit) continue; //just a blank space
		
		if (curSplit.match(/\//g)) //we don't want ending lines
		{
			return;
		}

		if(curSplit.endsWith("/>")) //strip off the last two characters of single-line elements
		{
			splits[splits.length - 1] = splits[splits.length - 1].slice(0, -2);
		}
		else if(curSplit.endsWith(">")) //strip last character off multi-line elements
		{
			splits[splits.length - 1] = splits[splits.length - 1].slice(0, -1);
		}

		if (curSplit.match(/</g)) //if it's the first one, initialize the dict
		{
			returnDictKey = curSplit.substring(1);
			returnDict[returnDictKey] = {};
		}

		else //add to the dict
		{
			var kv = curSplit.split("=");
			returnDict[returnDictKey][kv[0]] = kv[1].slice(1, -1); 
		}
	}
	return returnDict;
}

var initTop, initLeft;
var pageRef;
var surfaceLine;

var facsPoints = {};

function initializeMEI()
{
	var timeUUID = genUUID();
	var defaultMEIString = ['<?xml version="1.0" encoding="UTF-8"?>',
	'<mei xmlns="http://www.music-encoding.org/ns/mei" xml:id="' + genUUID() + '" meiversion="2013">',
	'  <music xml:id="' + genUUID() + '">',
	'    <timeline xml:id="' + genUUID() + '" origin="' + timeUUID + '">',
	'      <when xml:id="' + timeUUID + '" absolute="00:00:00">',
	'    </timeline xml:id="' + genUUID() + '">',
	'    <facsimile xml:id="' + genUUID() + '">',
 	'      <surface xml:id="' + genUUID() + '">',
	'      </surface>',
	'    </facsimile>',
	'  </music>',
	'</mei>'];

	pageRef = meiEditor.getPageData('untitled');
	pageRef.session.doc.insertLines(0, defaultMEIString);
	surfaceLine = 5;
}

function overlayMouseDownListener(e)
{
	$("#diva-overlay").on('mouseup', overlayMouseUpListener);
	$("#diva-overlay").on('mousemove', overlayMouseMoveListener);
	$("#diva-overlay").append('<div id="drag-div"></div>');
	$("#drag-div").css('z-index', $("#diva-overlay").css('z-index') + 1);
	initTop = e.pageY;
	initLeft = e.pageX;
	$("#drag-div").offset({'top': initTop, 'left':initLeft});
	overlayBoxULX = e.pageX;
	overlayBoxLRX = e.pageX;
	overlayBoxULY = e.pageY;
	overlayBoxLRY = e.pageX;
}

function overlayMouseMoveListener(e)
{
	var dragLeft = $("#drag-div").offset().left;
	var dragTop = $("#drag-div").offset().top;
	var dragRight = dragLeft + $("#drag-div").width();
	var dragBottom = dragTop + $("#drag-div").height(); 

	//if we're moving left
	if (e.pageX < initLeft)
	{
		$("#drag-div").offset({'left': e.pageX});
		$("#drag-div").width(dragRight - e.pageX);
	}
	//moving right
	else
	{
		$("#drag-div").width(e.pageX - dragLeft);
	}
	//moving up
	if (e.pageY < initTop)
	{
		$("#drag-div").offset({'top': e.pageY});
		$("#drag-div").height(dragBottom - e.pageY);
	}
	//moving down
	else
	{
		$("#drag-div").height(e.pageY - dragTop);
	}
}

function overlayMouseUpListener(e)
{ 
	var divaInnerObj = $("#1-diva-page-" + divaData.getCurrentPageIndex());

	//left position
	var draggedBoxLeft = $("#drag-div").offset().left - divaInnerObj.offset().left;
	//translated right position (converted to max zoom level)
	var draggedBoxRight = divaData.translateToMaxZoomLevel(draggedBoxLeft + $("#drag-div").outerWidth());
	//translated left - we needed the original left to get the right translation, so we translate it now
	draggedBoxLeft = divaData.translateToMaxZoomLevel(draggedBoxLeft);
	//same vertical
	var draggedBoxTop = $("#drag-div").offset().top - divaInnerObj.offset().top;
	var draggedBoxBottom = divaData.translateToMaxZoomLevel(draggedBoxTop + $("#drag-div").outerHeight());
	draggedBoxTop = divaData.translateToMaxZoomLevel(draggedBoxTop);

	var highlightInfo = {'width': draggedBoxRight - draggedBoxLeft, 'height': draggedBoxBottom - draggedBoxTop, 'ulx':draggedBoxLeft, 'uly': draggedBoxTop, 'divID': genUUID()};

	divaData.highlightOnPage(divaData.getCurrentPageIndex(), [highlightInfo]);

	meiEditor.localLog("Created highlight at (" + draggedBoxLeft + "," + draggedBoxTop + ") to (" + draggedBoxRight + ", " + draggedBoxBottom + ")");

	$("#diva-overlay").unbind("mousedown", overlayMouseDownListener);
	$("#diva-overlay").unbind("mousemove", overlayMouseMoveListener);
	$("#diva-overlay").unbind("mouseup", overlayMouseUpListener);
	$("#diva-overlay").remove();

	var surfaceSearch = pageRef.find(/\/surface/g,
	{
		wrap: true,
		range: null
	});
	if(surfaceSearch === undefined)
	{
		meiEditor.localError("Could not find MEI 'surface' element to insert 'zone' element. Aborted.");
		return false;
	}
	var surfaceLine = surfaceSearch.start.row;
	var facsUUID = genUUID();
	pageRef.session.doc.insertLines(surfaceLine, ['        <zone xml:id="' + facsUUID + '" ulx="' + draggedBoxLeft + '" uly="' + draggedBoxTop + '" lrx="' + draggedBoxRight + '" lry="' + draggedBoxBottom + '"/>']);

	var timelineSearch = pageRef.find(/\/timeline/g,
	{
		wrap: true,
		range: null
	});
	if(timelineSearch === undefined)
	{
		meiEditor.localError("Could not find MEI 'timeline' element to insert 'zone' element. Aborted.");
		return false;
	}
	var timelineLine = timelineSearch.start.row; 

	var origStartPoint = waveformAudioPlayer.getStartPoint();
	var minutes = parseInt(origStartPoint / 60, 10);
	var startPoint = origStartPoint - minutes*60;
	minutes = (minutes > 9) ? minutes.toString() : "0" + minutes.toString();

	var timeString = ("00:" + minutes + ":" + startPoint).slice(0, 12); //cap to milliseconds because toFixed(3) doesn't always work in audio.js

	pageRef.session.doc.insertLines(timelineLine, ['      <when xml:id="' + genUUID() + '" facs="' + facsUUID + '" absolute="' + timeString + '"/>']);
	
	waveformAudioPlayer.startAudioPlayback();

	regenerateFacsPoints();
}

function regenerateFacsPoints()
{
	var linesArr = pageRef.session.doc.getAllLines();

	for(line in linesArr)
	{
		var lineDict = parseXMLLine(linesArr[line]);
		if (!lineDict) continue;
		if (lineDict.hasOwnProperty('when'))
		{
			//facsPoints[start point] = {'facsUUID' : UUID of associated zone, 'yPos' : uly of associated zone}
			facsPoints[lineDict['when']['absolute']] = {
				'facsUUID': ((lineDict['when'].hasOwnProperty('facs')) ? lineDict['when']['facs'] : undefined),
				yPos: 0
			} 
		}

		else if (lineDict.hasOwnProperty('zone'))
		{
			for(curPoint in facsPoints)
			{
				if(curPoint['facsUUID'] == lineDict['zone']['xml:id'])
				{
					curPoint['yPos'] = lineDict['zone']['uly'];
				}
			}
		}
	}
}

function startMeiAppend(time)
{
	meiEditor.localLog("Got a request for a zone at "+ time);
	waveformAudioPlayer.pauseAudioPlayback(true);
	$('body').append('<div id="diva-overlay"></div>');
	$("#diva-overlay").css({
		'position': 'absolute',
		'z-index': 101
	});
	$("#diva-overlay").offset($("#diva").offset());
	$("#diva-overlay").height($("#diva").height());
	$("#diva-overlay").width($("#diva").width());
	$("#diva-overlay").on("mousedown", overlayMouseDownListener);
};