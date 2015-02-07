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

function overlayMouseDownListener(e)
{
	meiEditor.localLog("mousedown registered.");
	$("#diva-overlay").on('mouseup', overlayMouseUpListener);
};

function overlayMouseUpListener(e)
{
	meiEditor.localLog("Moseup registered ");
	waveformAudioPlayer.startAudioPlayback();
	$("#diva-overlay").unbind("mousedown", overlayMouseDownListener);
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
		'background-color': 'rgba(255, 0, 0, 0.5)',
		'z-index': 101
	});
	$("#diva-overlay").offset($("#diva").offset());
	$("#diva-overlay").height($("#diva").height());
	$("#diva-overlay").width($("#diva").width());
	$("#diva-overlay").on("mousedown", overlayMouseDownListener);
};