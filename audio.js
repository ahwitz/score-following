/*
Author: Andrew Horwitz

Various code sources:
    -http://stackoverflow.com/questions/22073716/create-a-waveform-of-the-full-track-with-web-audio-api
    -http://www.html5rocks.com/en/tutorials/webaudio/intro/
    -http://stackoverflow.com/questions/135448/how-do-i-check-if-an-object-has-a-property-in-javascript
*/

//Web Audio settings/vars
function hasOwnProperty(obj, prop) {
    var proto = obj.__proto__ || obj.constructor.prototype;
    return (prop in obj) &&
        (!(prop in proto) || proto[prop] !== obj[prop]);
}

window.AudioContext = window.AudioContext || window.webkitAudioContext ;

if (!AudioContext) alert('This site cannot be run in your Browser. Try a recent Chrome or Firefox. ');

var audioContext = new AudioContext();
var gainMod;
var audioBuffer;
var audioSource;

//Canvas settings/vars
var canvasWidth = $(window).width() - 20,  canvasHeight = 120 ;
var newCanvas   = createCanvas (canvasWidth, canvasHeight);
var canvasContext;
var samplesPerPixel;

//Other
var errorTimeout;
var ERROR_TIMEOUT_TIMER = 5000;

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

function writeError (text)
{
    $("#error").text(text);
    errorTimeout = setTimeout(function(){ $("#error").text(""); }, ERROR_TIMEOUT_TIMER);
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
        if(audioBuffer == null)
        {
            writeError("Nothing has been loaded.");
            return;
        }
        else if(audioSource !== undefined && audioSource.isPlaying === true)
        {
            writeError("Source is already playing.");
            return;
        }

        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.loop = false;
        audioSource.isPlaying = true;

        gainMod = audioContext.createGain();
        audioSource.connect(gainMod);
        gainMod.gain.value = 0.5;
        gainMod.connect(audioContext.destination);
        audioSource.start(0);
    });

    $("#pause-button").on('click', function()
    {
        if (audioSource !== undefined && audioSource.isPlaying === true) {
            audioSource.isPlaying = false;
            audioSource.stop(0);
        } 
        else
        {
            writeError("Source is not playing.");
            return;
        }
    });

    newCanvas.id = "waveform-canvas";
    document.body.appendChild(newCanvas);
    canvasContext = newCanvas.getContext('2d'); 
});

