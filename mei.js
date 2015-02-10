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

var initTop, initLeft;

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
	waveformAudioPlayer.startAudioPlayback();
	$("#diva-overlay").unbind("mousedown", overlayMouseDownListener);
	$("#diva-overlay").unbind("mousemove", overlayMouseMoveListener);
	$("#diva-overlay").unbind("mouseup", overlayMouseUpListener);
	$("#diva-overlay").remove();
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