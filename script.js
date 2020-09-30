let url = "";
let source = "";
let team = "";

$(document).ready(function() {
    new Bouncer('form');
    let clipboard = new ClipboardJS('#copy-btn');
    clipboard.on('success', function(e) {
        $.notify("URL Copied", "success");
    });
    
    clipboard.on('error', function(e) {
        $.notify("Failure while copying", "error");
    });
});

$("#url").keyup(function() {
    url = $(this).val();
    updateGeneratedURL();
});

$("#source").keyup(function() {
    source = $(this).val();
    updateGeneratedURL();
});

$("#team").keyup(function() {
    team = $(this).val();
    updateGeneratedURL();
});

function updateGeneratedURL(){
    let valuesEmpty = url === "" && source === "" && team === "";
    let valuesValidated = (new Bouncer()).validateAll(document.querySelector('form')).length === 0;
    $("#generated-url").val(valuesEmpty ? "" : `${url}#src=${source}&team=${team}`);
    $("#shorten-btn").css("display", valuesEmpty || !valuesValidated ? "none" : "inline-block");
}

$("#shorten-btn").click(function() {

    let client=new tinycc_client({
        api_root_url:"https://tinycc.com/tiny/api/3/",
        username:'<insert tinycc username>',
        api_key:'<insert tinycc api-key>',
    });

    client.shorten($("#generated-url").val()).then(data => {
		if(data.urls[0].error.code === 0){
            $.notify("URL Shortened", "success");
            $("#generated-url").val(data.urls[0].short_url);
        } else {
            $.notify(`Error shortening: ${data.urls[0].error.message}`, "error");
        }
	}).catch(error => {
        $.notify(`Error shortening: ${error.responseJSON.error.message}`, "error");
    });

})