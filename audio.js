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
var wCanvas, wCanvasContext; //waveform canvas
var pCanvas, pCanvasContext; //playback overlay canvas
var pCanvasAdvanceInterval, pCanvasPos; //variables for animation
var samplesPerPixel;

//Other
var errorTimeout;
var ERROR_TIMEOUT_TIMER = 5000;
var SAMPLE_RATE;

function initSound(arrayBuffer) {
    audioContext.decodeAudioData(arrayBuffer, function(buffer) {
        // audioBuffer is global to reuse the decoded audio later.
        audioBuffer = buffer;
        SAMPLE_RATE = buffer.sampleRate;
        renderCanvas();

        pCanvas = createCanvas(canvasWidth, canvasHeight, "playback-canvas");
        pCanvas.style.position = "fixed";
        pCanvas.style.zIndex = wCanvas.style.zIndex + 1;
        $("#playback-canvas").offset($("#waveform-canvas").offset());
        pCanvasContext = pCanvas.getContext('2d');
        pCanvasContext.fillStyle = 'rgba(0, 0, 0, 1)';
        pCanvasContext.fillRect(0,0,canvasWidth,canvasHeight);
        pCanvasContext.strokeStyle = '#FF0000';
        pCanvasContext.globalCompositeOperation = 'lighter';
    }, function(e) {
        console.log('Error decoding file', e);
    }); 
}

//display waveform
function renderCanvas() 
{
    var leftChannel = audioBuffer.getChannelData(0); // Float32Array describing left channel 
    var samplesPerPixel = leftChannel.length / canvasWidth;

    wCanvasContext.save();
    wCanvasContext.fillStyle = '#CCCCCC' ;
    wCanvasContext.fillRect(0,0,canvasWidth,canvasHeight );
    wCanvasContext.strokeStyle = '#00FF00';
    wCanvasContext.globalCompositeOperation = 'darker';
    wCanvasContext.translate(0,canvasHeight / 2);

    for (var i=0; i < leftChannel.length; i+=50)
    {
        var x = Math.floor ( canvasWidth * i / leftChannel.length ) ;
        var y = leftChannel[i] * canvasHeight / 2 ;
        wCanvasContext.beginPath();
        wCanvasContext.moveTo( x  , 0 );
        wCanvasContext.lineTo( x+1, y );
        wCanvasContext.stroke();
    }

    wCanvasContext.restore();
    console.log('done');
}

function createCanvas ( w, h, id ) 
{
    $("body").append("<canvas id='" + id + "'></canvas>");
    var tempCanvas = document.getElementById(id);
    console.log("making a new canvas", tempCanvas);
    tempCanvas.width  = w;
    tempCanvas.height = h;
    return tempCanvas;
}

function writeError (text)
{
    $("#error").text(text);
    errorTimeout = setTimeout(function()
    { 
        $("#error").text(""); 
    }, ERROR_TIMEOUT_TIMER);
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

        pCanvasContext.beginPath();
        pCanvasPos = 0;
        pCanvasContext.moveTo( pCanvasPos  , 0 );
        pCanvasContext.lineTo( pCanvasPos, canvasHeight );
        pCanvasContext.stroke();

        pCanvasAdvanceInterval = setInterval(function(e)
        {
            pCanvasContext.clearRect(pCanvasPos, 0, pCanvasPos, canvasHeight);
            pCanvasPos++;
            pCanvasContext.beginPath();
            pCanvasContext.moveTo( pCanvasPos  , 0 );
            pCanvasContext.lineTo( pCanvasPos, canvasHeight );
            pCanvasContext.stroke();            
        }, samplesPerPixel / SAMPLE_RATE);

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
        if (audioSource === undefined || audioSource.isPlaying === false) 
        {
            writeError("Source is not playing.");
            return;
        }
        
        audioSource.isPlaying = false;
        audioSource.stop(0);
        
        clearInterval(pCanvasAdvanceInterval);
        $("#playback-canvas").remove();
        pCanvas = null;
        pCanvasContext = null;
        pCanvasAdvanceInterval = null;
    });

    wCanvas = createCanvas(canvasWidth, canvasHeight, "waveform-canvas"); //waveform canvas
    wCanvasContext = wCanvas.getContext('2d'); 
});

