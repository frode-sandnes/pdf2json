"use strict"

// Globals - loaded independently from different form elements, used for generating the varipus reports
let convertedPdfTexts = [];
let jsonTextsToJoin = [];
let countDown = 0; // global counter

// Bootstrapping
window.addEventListener('DOMContentLoaded', (event) => setup());

async function setup()
    {
    // Add GUI handlers
    document.getElementById("file-selector-pdf")
	        .addEventListener('change', async (event) => loadFilesPDF(event, convertedPdfTexts));     
    document.getElementById("file-selector-json")
	        .addEventListener('change', (event) => loadFilesJson(event, jsonTextsToJoin));
    document.getElementById("processID")
            .addEventListener('click', (event) =>   
            {  
            // check if it is pdf or json input and save
            if (convertedPdfTexts.length > 0)
                {
                outputJson(convertedPdfTexts, "convertedPdfTexts");
                }
            else
                {
                const joinedJsonTexts = jsonTextsToJoin.flat();
                outputJson(joinedJsonTexts, "joinedJsonTexts");
                jsonTextsToJoin = joinedJsonTexts;
                }
            // hide form and counter
            closeGUI();                                                
            });    
    }

// GUI stuff
function closeGUI()
    {
    document.getElementById("submitButton").style.display = "none";
    document.getElementById("finalMessageId").style.display = "block";
    const noRecords = Math.max(convertedPdfTexts.length, jsonTextsToJoin.length);
    document.getElementById("finalMessageId").innerText = `Processed ${noRecords} records.`;
    }
let progressQueue = [];
function openProgressBar()
    {
    document.getElementById("pdfToConvert").style.display = "none";        
    document.getElementById("jsonToJoin").style.display = "none";        
    document.getElementById("progressBarId").style.display = "block";
    progressQueue.push(true);
//    document.getElementById("progressCounterId").innerText = progressQueue.length;
    document.getElementById("progressCounterId").innerText = countDown;
    }
function closeProgressBar()
    {
    countDown--;
    progressQueue.pop();
//    document.getElementById("progressCounterId").innerText = progressQueue.length;
    document.getElementById("progressCounterId").innerText = countDown;
    if (progressQueue.length == 0)
        {
        updateGUI();            
        document.getElementById("progressBarId").style.display = "none";
        }
    }
function setProgressMessage(message)
    {
    document.getElementById("progressMessageId").innerText = message;
    }

// indicate that report can be generated and highlight sections
function updateGUI()
    {
    // indicate that the submit button can be used
    if (convertedPdfTexts.length > 0 || jsonTextsToJoin.length > 0)
        {
        document.getElementById("submitButton").style.display = "block";
        }
    // highlight selected form elements
    if (convertedPdfTexts.length > 0)
        {
        document.getElementById("pdfToConvert").style.color = "lime";
        }
    if (jsonTextsToJoin.length > 0)
        {
        document.getElementById("jsonToJoin").style.color = "lime";
        }    
    }

// retrieving file contents of JSON files
function loadFilesJson(event, reports)
    {     
    const files = event.target.files;
    for (var i = 0, file; file = files[i]; i++) 
        {		
        var reader = new FileReader();
       
        reader.onload = (function(theFile) 
            {
            return function(e) 
                {  
                openProgressBar();            
                // read file into json og parse
                var json = JSON.parse(e.target.result);
                reports.push(json);
                closeProgressBar();
                };
            })(file);		
        reader.readAsText(file);
        }
    }

// retrieving file contents of pdf document
async function loadFilesPDF(event, reportArray)
    {     
    const docToText = new DocToText();   

    let reports = [];
    const files = event.target.files;
    countDown = files.length;
    for (var i = 0, file; file = files[i]; i++) 
        {		
        const {name} = file;
        // read full pdf text with the other library
        // this is because the firefox pdf.js library does not fascilitate accurate text extraction, yet it is needed to get page numbers and image info.
        await docToText.extractToText(file, "pdf")
            .then(correctedText =>
                {
                var reader = new FileReader();			
                reader.onload = (function(theFile) 
                    {
                    return function(e) 
                        {
                        parsePdf(e.target.result, name, reportArray, correctedText);   // also send start message to main gui                       
                        };
                    })(file);		
                reader.readAsBinaryString(file);    
                })
            .catch(error => console.log(error)); 
        }
    return reports; 
    }  

function parsePdf(binaryData, name, reportArray, alternativeText)
    {
// The pdf codes that can potentially represent images, 85 most common
    const pdfImageCodes = [ PDFJS.OPS.beginInlineImage,
                            PDFJS.OPS.beginImageData, 
                            PDFJS.OPS.endInlineImage, 
                            PDFJS.OPS.paintXObject,
                            PDFJS.OPS.paintJpegXObject,
                            PDFJS.OPS.paintImageMaskXObject,
                            PDFJS.OPS.paintImageMaskXObjectGroup,
                            PDFJS.OPS.paintImageXObject,
                            PDFJS.OPS.paintInlineImageXObject,
                            PDFJS.OPS.paintInlineImageXObjectGroup,
                            PDFJS.OPS.paintImageXObjectRepeat,
                            PDFJS.OPS.paintImageMaskXObjectRepeat,
                            PDFJS.OPS.paintSolidColorImageMask];        
    openProgressBar();    
    const loadingTask = pdfjsLib.getDocument({data: binaryData});
    loadingTask.promise
        .then(function(pdf) 
            {
            const totalPages = pdf.numPages;    
            let pages = [];
            for (var j = 1; j <= totalPages; j++)
                {
                pages.push(pdf.getPage(j));                    
                }
            Promise.all(pages).then((pages) =>      // first wait for all pages to load 
                {  
                // get page contents
                let pageContents = pages.map(page => page.getTextContent());
                Promise.all(pageContents).then((contents) => // then, wait for all contents to be extracted
                    {
                    let textPages = contents.map(content => 
                        {
                        let items = content.items;
                        let text = items.map(({str}) => str).join(" ");
                        return text;
                        })
                    let fullText = textPages.join(" ");
                    let prevValue = 0;
                    let pageIndices = textPages.map((text) => prevValue += text.length);   
                    // get image stats
                    let operators = pages.map(page => page.getOperatorList());
                    Promise.all(operators).then((opsList) => // then, wait for all contents to be extracted
                        {
                        let noImages = opsList.reduce((accumulator,ops) => accumulator + ops.fnArray.filter(v => pdfImageCodes.includes(v)).length, 0);
                        // if the other library is ok it should contain spaces
                        // some problems with Google Docs resulting in no spaces - in such cases resort to the pdf.js version instead
                        let report = {};
                        if ((alternativeText.match(/ /g) || []).length > 0) // yes there are spaces
                            {
                            // correct page numbers
                            const correctedTextLength = alternativeText.length;
                            const pageNoScalingFactor = correctedTextLength / fullText.length;
                            // adjust page numbers accordingly
                            pageIndices = pageIndices.map(pageIndex => Math.round(pageIndex * pageNoScalingFactor));
                            // finally pack up the results
                            report = {text: alternativeText, noPages: totalPages, filename: name, pageIndices: pageIndices, noImages: noImages};
                            }
                        else    // resort to pdf.js (google docs etc)    
                            {
                            report = {text: fullText, noPages: totalPages, filename: name, pageIndices: pageIndices, noImages: noImages};
                            }
                        // finally pack up the results
                        reportArray.push(report);   // Need to push as array assignment not allowed on paramter varibable (Reassignment)

                        setProgressMessage(`"Finished processing ${name})`)                    
                        closeProgressBar();
                        console.clear();    // get rid of image processing "noise" from pdfjs
                        });
                    });
                  })
            })        
        .catch(err => console.log(err));
    }

function outputJson(jsonObject, outputFilename)
    {
    saveTextFile(JSON.stringify(jsonObject, null, 2), outputFilename+".json");
    }
// using the fileSave library to output file  
function saveTextFile(text, filename)  
    {
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
    }
// called for output that goes to the GUI
function report(str, color = "yellow")
    {
    let e = document.createElement("p");
    e.innerText = str;
    e.style.color = color;
    document.getElementById("report").appendChild(e);
    }