var PDFAssembler = require("pdfassembler").PDFAssembler;
var model; 
var currentFilter = "all";
var images = [];
var pdfFiles = [];
var page = 0;
var currentFilterImages = images;
const imagesPerPage = 24;
loadModel();

jQuery.fn.extend({
    scrollToMe: function () {
        var x = jQuery(this).offset().top - 100;
        jQuery("html,body").animate({ scrollTop: x }, 400);
    }
});


// File Upload
function handleFileDropped(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    handleFileUpload(evt.dataTransfer.files); // FileList object
}

function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "copy"; // Explicitly show this is a copy.
}

function handleFileBrowse(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    handleFileUpload(evt.target.files); // FileList object
}

async function handleFileUpload(files) {
    waitingDialog.show("processing files...");
    await sleep(300);

    await Promise.all(Array.from(files).map(async (f) => {
        var data;
        if (f.type.match("image.*")) {
            // process image-files
            data = await loadImage(f);
            images.push({"data" : data, "attribute" : "unprocessed", "filename" : f.name, "pdfThumbnail" : false, "pdf_uuid" : "", "pdfPage" : 0, "uuid" : uuidv4()});
        }
        else if (f.type.match("application/pdf")) {
            // process pdf files
            data = await loadPDF(f);
            var uuid = uuidv4(); // unique identifier for pdf
            pdfFiles.push({"data" : data, "filename" : f.name, "uuid" : uuid});
            await generatePDFThumbnails(data, f, uuid);
        }
        else {
            return;
        }
        startFileAnimation();
    }));
    await updateImageFilterCache();
    await updateShownImages();
    waitingDialog.hide();
}

//generate pdf-thumbnails
async function generatePDFThumbnails(data, f, pdf_uuid) {
    var pdf = await pdfjsLib.getDocument(data);
    const totalPages = pdf.numPages;
    var promises = [];
    for(var i=1; i<=totalPages; i++) {
        promises.push(thumbnailFromPage(pdf, i, f, pdf_uuid));
    }
    await Promise.all(promises);
}

async function thumbnailFromPage(pdf, pageNumber, file, pdf_uuid) {
    var page = await pdf.getPage(pageNumber);
    var viewport = page.getViewport(1); //scale 1
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    var renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext);
    var imageData = await canvas.toDataURL("image/jpeg");
    await images.push({"data" : imageData, "attribute" : "unprocessed", "filename" : file.name + "_" + pageNumber, "pdfThumbnail" : true, "pdf_uuid" : pdf_uuid, "pdfPage" : pageNumber, "uuid" : uuidv4()});
}

// load-async-functions
async function loadImage(file) {
    return new Promise((resolve, reject) => {
        var reader = new FileReader();

        reader.onload = function(event) {
            var data = event.target.result;
            resolve(data);
        };

        // Read in the image file as a data URL.
        reader.readAsDataURL(file);
    });
}

async function loadPDF(file) {
    return new Promise((resolve, reject) => {
        var reader = new FileReader();

        reader.onload = function(event) {
            var data = event.target.result;
            resolve(data);
        };

        // Read in the pdf-file as a ArrayBuffer.
        reader.readAsArrayBuffer(file);
    });
}

async function startFileAnimation() {
    const animatedFileHTML = "<span class='fa fa-file-text animated-file'></span>";
    const animatedFile = $(animatedFileHTML).appendTo("body");
    animatedFile.css("left", (Math.random()*60+20) + "%");
    await sleep(1500);
    animatedFile.remove();
}

async function loadModel() {
    model = await tf.loadModel("model-data/model.json");
}

async function predictImages() {
    await waitingDialog.show("We are doing magic!");
    await sleep(500);
    await Promise.all(images.map(async (image) => {
        await predictImage(image)
    }));
    page = 0;
    await updateImageFilterCache();
    await waitingDialog.hide();
    await sleep(500);
}

async function predictImage(image) {
    var img = tf.fromPixels(await PrepareImageForPrediction(image), 3);
    img = tf.cast(tf.expandDims(img), "float32"); // expand to rank 4 and cast to float
    const prediction = model.predict(img).dataSync()[0];
    if (prediction === 0) {
        image.attribute = "empty";
    } else {
        image.attribute = "printed";
    }
}

async function PrepareImageForPrediction(image) {
    var canvas = document.createElement("canvas");
    canvas.width = 150;
    canvas.height = 150;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fill();
    var imgObject = await drawImageScaled(await base64ToImage(image.data), ctx);
    return await ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function prepareDocument() {
    for(var i=0; i<imagesPerPage; i++) {
        $("#output-images-container .row").append(`
            <div class="galleryElement col-lg-4 col-md-4 col-sm-4 col-xs-6 filter unprocessed">
                <img class="img-responsive-gallery px-2">
                <div class="btn-switch-category-container">
                    <button class="btn-switch-category"><i class="fa fa-exchange animated"></i></button>
                </div>
                <div class="status-label">
                    <i class="fa fa-asterisk"></i>
                    <i class="fa fa-file-o"></i>
                    <i class="fa fa-file-text"></i>
                </div>
            </div>
        `);
    }
    showImagesInGallery([]);
}

function showImagesInGallery(images) {
    var galleryElements = $(".galleryElement").toArray(); //available gallery-elements
    images.forEach(image => {
        $(galleryElements[0]).find("img").attr("src", image.data);
        $(galleryElements[0]).data("uuid", image.uuid);
        $(galleryElements[0]).removeClass("unprocessed printed empty");
        $(galleryElements[0]).addClass(image.attribute);
        $(galleryElements[0]).show(500);
        galleryElements.splice(0, 1); // remove from available gallery-elements
    });
    galleryElements.forEach(element => {
        $(element).hide(500);
    });
}

function updateShownImages() {
    var lowerBound = Math.min(page*imagesPerPage, images.length-1);
    showImagesInGallery(currentFilterImages.slice(lowerBound, lowerBound+imagesPerPage));
}

function getImagesWithAttribute(attribute, no_pdf_thumbnails = false) {
    var tempImages = [];
    images.forEach(image => {
        if(image.attribute === attribute && !(no_pdf_thumbnails && image.pdfThumbnail))
            tempImages.push(image);
    });
    return tempImages;
}

function updateImageFilterCache() {
    if(currentFilter === "all") {
        currentFilterImages = images;
        $(".status-label").show();
    }
    else {
        currentFilterImages = getImagesWithAttribute(currentFilter);
        $(".status-label").hide();
    }
    updateShownImages();
}

async function generateDownload(attribute) {
    // images to download
    if(getImagesWithAttribute("unprocessed").length>0) {
        await predictImages();
    } 

    //get images, exclude pdf-thumbnails
    var imgs = getImagesWithAttribute(attribute, true);

    waitingDialog.show("We are preparing your download!");
    await sleep(300);
    var zip = new JSZip();

    // generate & add pdfs
    var pdfs = await generatePDFs(attribute);
    await Promise.all(pdfs.map(async (pdf) => {
        zip.file(pdf.name, await loadPDF(pdf), {binary: true})
    }));

    // add images
    await Promise.all(imgs.map(async (img) => {
        zip.file(img.filename, img.data.split(",")[1], {base64: true})
    }));

    // start download
    zip.generateAsync({type:"blob"})
    .then(function (blob) {
        saveAs(blob, attribute + ".zip");
    }).then(function() {
        waitingDialog.hide();
    });
}

async function generatePDFs(attribute) {
    var out_pdfs = [];
    await Promise.all(pdfFiles.map(async (f) => { 
        var pdfAssemblerObj = new PDFAssembler(f.data);
        var pdf = await pdfAssemblerObj.pdfObject;
        const thumbnails = getThumbnailsOfPDF(f, attribute);
        var pages = pdf["/Root"]["/Pages"]["/Kids"];
        pages = getSubArrayFromIndices(pages, thumbnails.map(a => a.pdfPage-1)); // keep only pages of category
        pdf["/Root"]["/Pages"]["/Kids"] = pages;
        await pdfAssemblerObj.removeRootEntries();
        out_pdfs.push(await pdfAssemblerObj.assemblePdf(f.filename));
    }));
    return out_pdfs;
}

function getThumbnailsOfPDF(pdf, attribute = "all") {
    var tempImages = [];
    images.forEach(image => {
        if(image.pdfThumbnail && image.pdf_uuid === pdf.uuid && (image.attribute === attribute || attribute === "all"))
            tempImages.push(image);
    });
    return tempImages;
}

function getSubArrayFromIndices(array, indices) {
    var tempArray = [];
    indices.forEach(index => {
        tempArray.push(array[index]);
    });
    return tempArray;
}

// helper functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function drawImageScaled(img, ctx) {
    var canvas = ctx.canvas;
    var hRatio = canvas.width  / img.width;
    var vRatio =  canvas.height / img.height;
    var ratio  = Math.min ( hRatio, vRatio );
    var centerShift_x = ( canvas.width - img.width*ratio ) / 2;
    var centerShift_y = ( canvas.height - img.height*ratio ) / 2;  
    ctx.drawImage(img, 0,0, img.width, img.height,
                       centerShift_x,centerShift_y,img.width*ratio, img.height*ratio);  
}

async function base64ToImage(src) {
    return new Promise((resolve, reject) => {
        var img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}

$(document).ready(function () {
    // Check for the various File API support.
    if (window.File && window.FileReader && window.FileList && window.Blob) {
        var dropZone = document.getElementById("drop_zone");
        dropZone.addEventListener("dragover", handleDragOver); // jQuery not used, because of dataTransfer
        dropZone.addEventListener("drop", handleFileDropped);
        $("#browseFiles").bind("change", handleFileBrowse);
    } else {
        alert("The File APIs are not fully supported in this browser.");
    }

    prepareDocument();

    $(".startProcessing").click(function (e) {
        e.preventDefault();
        predictImages();
    });

    $(".filter-button").click(function () {
        currentFilter = $(this).attr("data-filter");
        updateImageFilterCache();
        page = 0;
    });

    // previous page
    $(".page-switcher.left").click(function() {
        if(page>0) {
            page--; 
            updateShownImages();
        }
    });

    // next page
    $(".page-switcher.right").click(function() {
        if((page+1)*imagesPerPage<currentFilterImages.length-1) {
            page++; 
            updateShownImages();
        }
    });

    // switch category
    $("#output-images-container .row").on("click", ".btn-switch-category", function () {
        var self = $(this).closest(".galleryElement");
        var imageObject = images.find(function(image) {
            return image.uuid === self.data("uuid");
        });
        if(imageObject !== undefined) {
            if (self.hasClass("empty")) {
                imageObject.attribute = "printed";
            }
            else if (self.hasClass("printed")) {
                imageObject.attribute = "empty";
            }
        } else {
            console.error("Image not found in DB!");
        }
        updateImageFilterCache();
    });

    // download printed images
    $("#downloadPrinted").click(function () {
        generateDownload("printed");
    });

    // download empty images
    $("#downloadEmpty").click(function () {
        generateDownload("empty");
    });
});