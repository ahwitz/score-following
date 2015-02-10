this.onmessage = function(e)
{
    this.audioData = e.data.audioData;

    this.decodeAudioData(this.audioData, function(data) {
        postMessage({"success": data});
    }, function(e) {
        postMessage({"failure": 'Error decoding file' + e});
    }); 
};
