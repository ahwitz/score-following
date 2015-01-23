/*
Author: Andrew Horwitz

Various code sources:
    -http://stackoverflow.com/questions/22073716/create-a-waveform-of-the-full-track-with-web-audio-api
*/

//Web Audio settings/vars
window.AudioContext = window.AudioContext || window.webkitAudioContext ;

if (!AudioContext) alert('This site cannot be run in your Browser. Try a recent Chrome or Firefox. ');

var audioContext = new AudioContext();
var audioSource = audioContext.createBufferSource();
var gainMod;
var audioBuffer = null;

//Canvas settings/vars
var canvasWidth = $(window).width() - 20,  canvasHeight = 120 ;
var newCanvas   = createCanvas (canvasWidth, canvasHeight);
var canvasContext;
var samplesPerPixel;

function initSound(arrayBuffer) {
    audioContext.decodeAudioData(arrayBuffer, function(buffer) {
        // audioBuffer is global to reuse the decoded audio later.
        audioBuffer = buffer;
        renderCanvas();
    }, function(e) {
        console.log('Error decoding file', e);
    }); 
}

// MUSIC DISPLAY
function renderCanvas() 
{
    console.log('called');
    var leftChannel = audioBuffer.getChannelData(0); // Float32Array describing left channel 
    var rightChannel = audioBuffer.getChannelData(1); // Float32Array describing right channel 
    var samplesPerPixel = leftChannel.length / canvasWidth;    
    canvasContext.save();
    canvasContext.fillStyle = '#CCCCCC' ;
    canvasContext.fillRect(0,0,canvasWidth,canvasHeight );
    canvasContext.strokeStyle = '#00FF00';
    canvasContext.globalCompositeOperation = 'darker';
    canvasContext.translate(0,canvasHeight / 2);

    for (var x=0; x < canvasWidth; x++) {
        var yMax = 0, yMin = 0;

        for (var j=0; j < samplesPerPixel; j++){
            yMax = Math.max(yMax, leftChannel[canvasWidth*x + j]);
            yMin = Math.max(yMin, leftChannel[canvasWidth*x + j]);
        }

        yMax = yMax * canvasHeight / 2 ;
        yMin = -(yMin * canvasHeight / 2 );

        canvasContext.beginPath();
        canvasContext.moveTo( x, yMin );
        canvasContext.lineTo( x, yMax );
        canvasContext.stroke();
    }
    canvasContext.restore();
    console.log('done');
    $("#click").remove();
    $("#playback").css('display', 'block');
}

function createCanvas ( w, h ) 
{
    var newCanvas = document.createElement('canvas');
    newCanvas.width  = w;
    newCanvas.height = h;
    return newCanvas;
}

$(window).on('load', function(e)
{
    var fileInput = document.querySelector('input[type="file"]');

    fileInput.addEventListener('change', function(e) {  //
        var reader = new FileReader();
        reader.onload = function(e) {
            initSound(this.result);
        };
        reader.readAsArrayBuffer(this.files[0]);
    }, false);


    $("#play-button").on('click', function()
    {
        gainMod = audioContext.createGain();
        audioSource.connect(gainMod);
        gainMod.gain.value = 0.5;
        gainMod.connect(audioContext.destination);
        audioSource.start(0);
        console.log('started?');
    });

    newCanvas.id = "waveform-canvas";
    document.body.appendChild(newCanvas);
    canvasContext = newCanvas.getContext('2d'); 
});

