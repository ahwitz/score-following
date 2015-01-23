// AUDIO CONTEXT
window.AudioContext = window.AudioContext || window.webkitAudioContext ;

if (!AudioContext) alert('This site cannot be run in your Browser. Try a recent Chrome or Firefox. ');

var audioContext = new AudioContext();
var currentBuffer  = null;

// CANVAS
var canvasWidth = $(window).width() - 20,  canvasHeight = 120 ;
var newCanvas   = createCanvas (canvasWidth, canvasHeight);
var context     = null;
var samplesPerPixel;

window.onload = appendCanvas;
function appendCanvas() 
{ 
    newCanvas.id = "waveform-canvas";
    document.body.appendChild(newCanvas);
    context = newCanvas.getContext('2d'); 
}

// MUSIC LOADER + DECODE
function loadMusic(url) {   
    var req = new XMLHttpRequest();
    req.open( "GET", url, true );
    req.responseType = "arraybuffer";    
    req.onreadystatechange = function (e) {
          if (req.readyState == 4) {
             if(req.status == 200)
                  audioContext.decodeAudioData(req.response, 
                    function(buffer) {
                        console.log("loaded");
                        currentBuffer = buffer;
                        displayBuffer(buffer);
                    }, onDecodeError);
             else
                  alert('error during the load.Wrong url or cross origin issue');
          }
    } ;
    req.send();
}

function onDecodeError() {  alert('error while decoding your file.');  }

// MUSIC DISPLAY
function displayBuffer(buff /* is an AudioBuffer */) {
    var leftChannel = buff.getChannelData(0); // Float32Array describing left channel 
    var rightChannel = buff.getChannelData(1); // Float32Array describing right channel 
    var samplesPerPixel = leftChannel.length / canvasWidth;    
    context.save();
    context.fillStyle = '#CCCCCC' ;
    context.fillRect(0,0,canvasWidth,canvasHeight );
    context.strokeStyle = '#00FF00';
    context.globalCompositeOperation = 'darker';
    context.translate(0,canvasHeight / 2);

    for (var x=0; x < canvasWidth; x++) {
        var yMax = 0, yMin = 0;

        for (var j=0; j < samplesPerPixel; j++){
            yMax = Math.max(yMax, leftChannel[canvasWidth*x + j]);
            yMin = Math.max(yMin, leftChannel[canvasWidth*x + j]);
        }

        yMax = yMax * canvasHeight / 2 ;
        yMin = -(yMin * canvasHeight / 2 );

        context.beginPath();
        context.moveTo( x, yMin );
        context.lineTo( x, yMax );
        context.stroke();
    }
    context.restore();
    console.log('done');
    $("#click").remove();
}

function createCanvas ( w, h ) {
    var newCanvas = document.createElement('canvas');
    newCanvas.width  = w;     newCanvas.height = h;
    return newCanvas;
};

$(window).on('load', function(e)
{
    //document.body.appendChild(newCanvas);
    //context = newCanvas.getContext('2d');
    console.log("loading");
    loadMusic('stocksmall.ogg');
});
