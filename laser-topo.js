const { promisify, inspect } = require('util')
const D3Node = require('d3-node')
const d3 = require('d3')
const fs = require('fs')
const mapshaper = require('mapshaper')
const topojson = require('topojson')
var numeral = require('numeral');


const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const dpi = 96
const width = 8 * dpi
const sheetWidth = 18 * dpi
const sheetHeight = 12 * dpi

async function main() {

  const rawData = JSON.parse(await readFile("rainier-raw.topojson"));

  const result = await promisify(mapshaper.applyCommands)([
    '-i input.topojson',
    '-simplify 10% stats',
    "-filter 'this.width*this.height > 1e-6' remove-empty",
//    "-each 'console.log(this.width*this.height)'",
    '-split elev',
    '-o output.topojson'
  ].join(' '), {
    'input.topojson': rawData
  });

  const contours = JSON.parse(result['output.topojson']);
  const mergedContours = topojson.feature(contours,
      {type: "GeometryCollection", geometries: Object.values(contours.objects)})

  // console.log('contours: ' + inspect(contours, {colors: true, depth: 3}))

  var projection = d3.geoAzimuthalEqualArea()
    .rotate([121.7608787, -46.8517996])
    .fitWidth(width, mergedContours)
  var path = d3.geoPath().projection(projection)

  var contourSize = path.bounds(mergedContours)[1]
  //console.log(inspect(contourSize))

  // Start off with a blank GC as our base plate
  var objs = [{type: "GeometryCollection", "geometries": []}]
  for (let k of Object.keys(contours.objects).sort()) {
    objs.push(contours.objects[k])
  }

  let output = 0
  while (objs.length > 0) {
    let d3n = new D3Node({
      d3Module: d3,
      styles: `
  svg {
    fill: none;
    stroke-width: 0.6px;
  }

  .contour {
    stroke: #00FF00;
  }

  .base {
    stroke: #FF0000;
  }
  `})

    let localObjs = []
    localObjs.push(objs.shift())
    if (objs.length > 0) {
      localObjs.push(objs.shift())
    }

    let svg = d3n.createSVG(sheetWidth, sheetHeight)
    let g = svg.selectAll(".contour")
      .data(localObjs)
      .enter()
      .append("g")
      .attr('transform',
        (d, i) => `translate(${i*(contourSize[0] + 0.1*dpi)}, 0)`)

    g.append('rect')
      .attr('width', contourSize[0])
      .attr('height', contourSize[1])
      .attr('class', 'base')

    g.selectAll("path")
      .data((d) => topojson.feature(contours, d).features )
      .enter()
      .append("path")
      .attr("d", path)
      .attr('class', 'contour')

    await writeFile(`rainier-${numeral(output).format('00')}.svg`, d3n.svgString())
    output++
  }
}

main()