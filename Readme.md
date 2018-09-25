# MalSCC - Machine Learning Scan Classifier
MalSCC is a tool to sort out empty pages from bulk scans. This repository contains the source code for the ![web-app](https://malscc.de). It uses a pre-trained artificial neural network to categorize the pages.

## How to build

First execute ```npm install``` to install the required dependencies.

To build the static files for a minimal webserver execute ```npm run build-static```.
The output files are going to be generated in the ```dist``` directory. 

## Contributing

Run ```npm run watch``` to start the local development server.
