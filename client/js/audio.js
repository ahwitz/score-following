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
        var editMode = options.editMode || false;

        //Keeps track of playback position 
        var audioSourceStartPoint = 0; //point in the music where the source will start playing from
        var audioSourceStartTime; //time at which the audio started playing
        var pCanvasAdvanceInterval, intervalRefreshSpeed, playbackBarPosition; //variables for animation

        //Canvas settings/vars
        var canvasWidth, canvasHeight = 120;
        var wCanvas; //waveform canvas
        var pCanvas; //playback overlay canvas
        var pCanvasContext;

        //Other
        var errorTimeout;
        var ERROR_TIMEOUT_TIMER = 5000;
        var SAMPLE_RATE;
        var PEAK_RESOLUTION = 50;
        var playbackMode = editMode;

        /* RESOURCE FUNCTIONS */
        //creates a canvas - before is a jQuery/CSS selector
        function createCanvas ( before, w, h, id ) 
        {
            $(options.parentSelector).append("<canvas id='" + id + "' width='" + w + "' height='" + h + "'></canvas>");
            var tempCanvas = document.getElementById(id);
            return tempCanvas;
        }

        //writes an error in the error div
        function writeError (text)
        {
            $(options.parentSelector + " .error").text(text);
            errorTimeout = setTimeout(function()
            { 
                $(options.parentSelector + " .error").text(""); 
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
            pCanvas = createCanvas(options.parentSelector + " .error", canvasWidth, canvasHeight, options.parentID + "-playback-canvas");
            pCanvas.style.position = "absolute";
            pCanvas.style.zIndex = wCanvas.style.zIndex + 1;
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

            var wCanvasContext = document.getElementById(options.parentID + "-waveform-canvas").getContext('2d');
            wCanvasContext.clearRect(0, 0, canvasWidth, canvasHeight);

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

                $(pCanvas).css('left', 0);
                // $(wCanvas).offset({'left': 0});
                $(options.parentSelector + ' .play-button').prop('disabled', false);
                $(options.parentSelector + ' .pause-button').prop('disabled', false);
                $(options.parentSelector + ' .source-volume').prop('disabled', false);
                initListeners();
            }, function(e) {
                console.log('Error decoding file', e);
            }); 
        }

        //Initializes keyboard listeners
        function initListeners() 
        {
            $(options.parentSelector + " .play-button").on('click', function()
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

            $(options.parentSelector + " .pause-button").on('click', function()
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
                mei.Events.publish("JumpedToTime", [audioSourceStartPoint]);

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
                            pauseAudioPlayback(true);
                        else
                            startAudioPlayback();
                    }

                    //pause the audio playback and wait for zone
                    else if(audioSource && audioSource.isPlaying)
                    {
                        pauseAudioPlayback(true);
                        meiUpdateStartFunction(currentTimeToPlaybackTime());
                    }
                }
            });

            $(window).on('resize', function(e)
            {
                console.log("Resizing?");
                $(pCanvas).offset($(wCanvas).offset());
                $(pCanvas).width($(wCanvas).width());
                $(pCanvas).height($(wCanvas).height());
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
        };

        //Actual init function for the entire object
        function init()
        {
            var idIdx = 1;
            options.parentIdentifier = options.parentObject.parent().attr('id');
            options.parentID = options.parentIdentifier + '-waveform-' + idIdx;
            while (document.getElementById(options.parentID))
                options.parentID = options.parentIdentifier + '-waveform-' + (idIdx++);

            options.parentObject.attr('id', options.parentID);
            options.parentSelector = "#" + options.parentID;

            options.parentObject.append('<div class="waveform-title">' + options.title + '</div>' +
                '<button class="play-button" disabled>Play</button>' +
                '<button class="pause-button" disabled>Pause</button>' +
                '&nbsp;&nbsp;Volume: <input class="source-volume" type="range" min="0" max="1" step="0.01" value="' + INITIAL_GAIN_VALUE.toString() + '" disabled/>' +
                (editMode ? '&nbsp;&nbsp;Playback mode: <input type="checkbox" class="playback-checkbox">' +
                '<span class="autoscroll-wrapper" style="display:none">&nbsp;&nbsp;Autoscroll: <input type="checkbox" id="autoscroll-checkbox"></span><br>' : "") +
                (options.fileOnLoad ? "" : '<input class="file-input" type="file" accept="audio/*">') +
                '<div class="error"></div>');
            canvasWidth = $(options.parentSelector).width() - 20;

            if (options.fileOnLoad) // http://www.henryalgus.com/reading-binary-files-using-jquery-ajax/
            {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', options.fileOnLoad, true);
                xhr.responseType = 'arraybuffer';
                 
                xhr.onload = function(e) {
                    initSound(this.response); 
                };
                 
                xhr.send();
            }
            else
            {
                document.querySelector(options.parentSelector + " .file-input").addEventListener('change', function(e) {
                    if (this.files.length === 0) return;
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        initSound(this.result);
                    };
                    reader.readAsArrayBuffer(this.files[0]);
                }, false);
            }

            $(options.parentSelector + " .playback-checkbox").on('change', function(e)
            {
                playbackMode = $(options.parentSelector + " .playback-checkbox").is(":checked");
            });

            $(options.parentSelector + " .source-volume").on('change', function(e){
                if(gainMod) gainMod.gain.value = $(options.parentSelector + " .source-volume").val();
            });

            wCanvas = createCanvas(options.parentSelector + " .error", canvasWidth, canvasHeight, options.parentID + "-waveform-canvas"); //waveform canvas
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
