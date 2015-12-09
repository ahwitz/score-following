/*
Author: Andrew Horwitz

Various code sources:
    -http://stackoverflow.com/questions/22073716/create-a-waveform-of-the-full-track-with-web-audio-api
    -http://www.html5rocks.com/en/tutorials/webaudio/intro/
    -http://stackoverflow.com/questions/135448/how-do-i-check-if-an-object-has-a-property-in-javascript
*/

function hasOwnProperty(obj, prop) {
    var proto = obj.__proto__ || obj.constructor.prototype;
    return (prop in obj) &&
        (!(prop in proto) || proto[prop] !== obj[prop]);
}

// this pattern was taken from http://www.virgentech.com/blog/2009/10/building-object-oriented-jquery-plugin.html
(function ($)
{
    var WebAudioPlayer = function (element, options)
    {
        window.AudioContext = window.AudioContext || window.webkitAudioContext ;

        if (!AudioContext) alert('This site cannot be run in your Browser. Try a recent Chrome or Firefox. ');

        //Web Audio API variables
        var audioContext = new AudioContext();
        var gainMod = audioContext.createGain();
        var INITIAL_GAIN_VALUE = 0.6;
        gainMod.gain.value = INITIAL_GAIN_VALUE;
        var audioBuffer;
        var audioSource;

        //Keeps track of playback position 
        var audioSourceStartPoint = 0; //point in the music where the source will start playing from
        var audioSourceStartTime; //time at which the audio started playing
        var pCanvasAdvanceInterval, intervalRefreshSpeed, playbackBarPosition; //variables for animation

        //Canvas settings/vars
        var canvasWidth, canvasHeight = 120;
        var wCanvas, wCanvasContext; //waveform canvas
        var pCanvas, pCanvasContext; //playback overlay canvas

        //Other
        var errorTimeout;
        var ERROR_TIMEOUT_TIMER = 5000;
        var SAMPLE_RATE;
        var PEAK_RESOLUTION = 50;
        var playbackMode = false;
        var autoscrollMode = false;

        /* RESOURCE FUNCTIONS */
        //creates a canvas - before is a jQuery/CSS selector
        function createCanvas ( before, w, h, id ) 
        {
            $(before).before("<canvas id='" + id + "'></canvas>");
            var tempCanvas = document.getElementById(id);
            tempCanvas.width  = w;
            tempCanvas.height = h;
            return tempCanvas;
        }

        //writes an error in the error div
        function writeError (text)
        {
            $("#error").text(text);
            errorTimeout = setTimeout(function()
            { 
                $("#error").text(""); 
            }, ERROR_TIMEOUT_TIMER);
        }

        function realTimeToPlaybackTime (time) 
        {
            if(!audioSourceStartTime) return 0;

            var timeDifference = time / 1000 - audioSourceStartTime;
            return parseFloat((timeDifference + audioSourceStartPoint).toFixed(3));
        }

        function currentTimeToPlaybackTime ()
        {
            if(audioSource && !audioSource.isPlaying) return audioSourceStartPoint;

            return realTimeToPlaybackTime(Date.now());
        }


        /* PLAYBACK FUNCTIONS */
        //(re)starts playback at audioSourceStartPoint
        function startAudioPlayback()
        {
            if(audioSource && audioSource.isPlaying) {
                pauseAudioPlayback(false);
            }

            audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.loop = false;
            audioSource.isPlaying = true;

            audioSource.connect(gainMod);
            gainMod.connect(audioContext.destination);
            audioSource.start(0, audioSourceStartPoint);
            audioSourceStartTime = Date.now() / 1000;

            playbackBarPosition = (audioSourceStartPoint / audioBuffer.duration) * canvasWidth;
            drawPlaybackLine();

            pCanvasAdvanceInterval = setInterval(drawPlaybackLine, intervalRefreshSpeed);
        }

        //Pauses playback; will save current playback point if saveCurrent is true
        function pauseAudioPlayback(saveCurrentPoint)
        {
            if(saveCurrentPoint) audioSourceStartPoint = currentTimeToPlaybackTime();

            audioSource.isPlaying = false;
            audioSource.stop(0);

            clearInterval(pCanvasAdvanceInterval);
            pCanvasAdvanceInterval = null;
        }

        //Creates playback canvas (the moving red bar)
        function renderPlaybackCanvas()
        {
            pCanvas = createCanvas("#error", canvasWidth, canvasHeight, "playback-canvas");
            pCanvas.style.position = "absolute";
            pCanvas.style.zIndex = wCanvas.style.zIndex + 1;
            $("#playback-canvas").offset($("#waveform-canvas").offset());
            pCanvasContext = pCanvas.getContext('2d');
            pCanvasContext.fillStyle = 'rgba(0, 0, 0, 0)';
            pCanvasContext.fillRect(0,0,canvasWidth,canvasHeight);
            pCanvasContext.strokeStyle = 'rgba(255, 0, 0, 0.5)';

            intervalRefreshSpeed = audioBuffer.duration * 1000 / canvasWidth;
        }

        //Displays waveform canvas (the background waveform)
        function renderWaveformCanvas() 
        {
            var leftChannel = audioBuffer.getChannelData(0); // Float32Array describing left channel 

            wCanvasContext.save();
            wCanvasContext.fillStyle = '#CCCCCC';
            wCanvasContext.fillRect(0,0,canvasWidth,canvasHeight );
            wCanvasContext.strokeStyle = '#00FF00';
            wCanvasContext.globalCompositeOperation = 'darker';
            wCanvasContext.translate(0,canvasHeight / 2);
            
            var i = 0, maxY = 0, minY = 0;
            while(i < leftChannel.length)
            {
                maxY = Math.max(maxY, leftChannel[i]);
                minY = Math.min(minY, leftChannel[i]);

                if(i % PEAK_RESOLUTION === 0)
                {
                    var x = Math.floor ( canvasWidth * i / leftChannel.length ) ;
                    maxY = maxY * canvasHeight / 2;
                    minY = minY * canvasHeight / 2;
                    wCanvasContext.beginPath();
                    wCanvasContext.moveTo( x, 0 );
                    wCanvasContext.lineTo( x+1, maxY );
                    wCanvasContext.lineTo( x+1, minY );
                    wCanvasContext.stroke();
                    maxY = 0;
                    minY = 0;
                }

                i++;
            }

            wCanvasContext.restore();
        }

        //Called on an interval to update the playback position marker
        function drawPlaybackLine()
        {
            pCanvasContext.clearRect(0, 0, canvasWidth, canvasHeight);
            playbackBarPosition++;
            pCanvasContext.beginPath();
            pCanvasContext.moveTo( playbackBarPosition  , 0 );
            pCanvasContext.lineTo( playbackBarPosition, canvasHeight );
            pCanvasContext.stroke(); 
        }

        /* INIT FUNCTIONS */

        //Initializes a sound once file is loaded
        function initSound(arrayBuffer) {
            wCanvasContext.clearRect(0, 0, canvasWidth, canvasHeight);
            /*
            //Web Audio API devs say this is implemented, but I'm not sure if it is or not...
            for(x in audioContext){console.log(x);}
            var audioDecoderWorker = audioContext.createAudioWorker("audioDecoderWorker.js", 1, 1);
            var attributes = {
                'audioData': arrayBuffer
            };
            audioDecoderWorker.postMessage(attributes);
            audioDecoderWorker.onmessage = function(buffer) {*/

            audioContext.decodeAudioData(arrayBuffer, function(buffer) {
                // audioBuffer is global to reuse the decoded audio later.
                audioBuffer = buffer;
                SAMPLE_RATE = buffer.sampleRate;
                renderWaveformCanvas();
                renderPlaybackCanvas();
                $('#play-button').prop('disabled', false);
                $('#pause-button').prop('disabled', false);
                $('#source-volume').prop('disabled', false);
                initListeners();
            }, function(e) {
                console.log('Error decoding file', e);
            }); 
        }

        //Initializes keyboard listeners
        function initListeners() {

            $("#play-button").on('click', function()
            {
                if(audioBuffer === null)
                {
                    writeError("Nothing has been loaded.");
                    return;
                }
                else if(audioSource !== undefined && audioSource.isPlaying === true)
                {
                    return;
                }

                startAudioPlayback();
            });

            $("#pause-button").on('click', function()
            {
                if (audioSource === undefined || audioSource.isPlaying === false) 
                {
                    writeError("Source is not playing.");
                    return;
                }

                pauseAudioPlayback(true);
            });

            $(pCanvas).on('click', function(e){
                var totalLength = canvasWidth;
                var lengthIn = e.pageX - $(this).offset().left;

                audioSourceStartPoint = (lengthIn / totalLength) * audioBuffer.duration;

                startAudioPlayback();
            });

            //have to prevent space scroll on keydown rather than keyup
            $(window).on('keydown', function(e)
            {
                //space bar
                if (e.keyCode == 32) {
                    e.preventDefault();
                }
            });

            $(window).on('keyup', function(e)
            {
                //space bar
                if (e.keyCode == 32)
                {
                    if(playbackMode)
                    {
                        if(audioSource && audioSource.isPlaying)
                        {
                            pauseAudioPlayback(true);
                        }
                        else
                        {
                            startAudioPlayback();
                        }

                    }

                    //pause the audio playback and wait for zone
                    else if(audioSource && audioSource.isPlaying)
                    {
                        pauseAudioPlayback(true);
                        startMeiAppend(currentTimeToPlaybackTime());
                    }
                }
            });
        }

        this.realTimeToPlaybackTime = function (time) 
        {
            return realTimeToPlaybackTime(time);
        };

        this.currentTimeToPlaybackTime = function ()
        {
            return currentTimeToPlaybackTime();
        };

        this.getStartPoint = function ()
        {
            return audioSourceStartPoint.toFixed(3);
        };

        this.startAudioPlayback = function()
        {
            startAudioPlayback();
        };

        this.pauseAudioPlayback = function(saveCurrentPoint)
        {
            pauseAudioPlayback(saveCurrentPoint);
        };

        this.isPlaying = function()
        {
            if (!audioSource) return false;
            return audioSource.isPlaying;
        }

        //Actual init function for the entire object
        function init()
        {
            $("#waveform").append('<button id="play-button" disabled>Play</button>' +
                '<button id="pause-button" disabled>Pause</button>' +
                '&nbsp;&nbsp;Volume: <input id="source-volume" type="range" min="0" max="1" step="0.01" value="' + INITIAL_GAIN_VALUE.toString() + '" disabled/>' +
                '&nbsp;&nbsp;Playback mode: <input type="checkbox" id="playback-checkbox">' +
                '<span id="autoscroll-wrapper" style="display:none">&nbsp;&nbsp;Autoscroll: <input type="checkbox" id="autoscroll-checkbox"></span><br>' +
                '<input id="file-input" type="file" accept="audio/*"><br>' +
                '<div id="error"></div><br>');
            canvasWidth = $("#waveform").width() - 20;
            var fileInput = document.querySelector('input[type="file"]');

            fileInput.addEventListener('change', function(e) {  //
                var reader = new FileReader();
                reader.onload = function(e) {
                    initSound(this.result);
                };
                reader.readAsArrayBuffer(this.files[0]);
            }, false);

            $("#playback-checkbox").on('change', function(e)
            {
                playbackMode = $("#playback-checkbox").is(":checked");
            });

            $("#source-volume").on('change', function(e){
                if(gainMod) gainMod.gain.value = $("#source-volume").val();
            });

            wCanvas = createCanvas("#error", canvasWidth, canvasHeight, "waveform-canvas"); //waveform canvas
            wCanvasContext = wCanvas.getContext('2d'); 
        }

        init();
    };

    $.fn.wap = function (options)
    {
        return this.each(function ()
        {
            // Save the reference to the container element
            options.parentObject = $(this);

            // Return early if this element already has a plugin instance
            if (options.parentObject.data('wap'))
                return;

            // Otherwise, instantiate the document viewer
            var webAudioPlayer = new WebAudioPlayer(this, options);
            options.parentObject.data('wap', webAudioPlayer);
        });
    };

})(jQuery);
