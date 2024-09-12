

import puppeteer from 'puppeteer-extra';

import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import AnonymizeUa from 'puppeteer-extra-plugin-anonymize-ua';

import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

import fs from 'fs'

import chalk from 'chalk';

import dotenv from 'dotenv';

import request from 'request';

import progress from 'request-progress';
import axios from 'axios';

(async () => {

    dotenv.config();

    const headless = process.env.HEADLESS != 'new' && process.env.HEADLESS != 'true' ? false : 'new';
    const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT || '2000');
    const NBR_PAGE = parseInt(process.env.NBR_PAGE || '100');
    const USE_WEB_CACHE = process.env.USE_WEB_CACHE == 'true' || process.env.USE_WEB_CACHE == '1';
    const URL_TO_SCRAPE = process.env.URL_TO_SCRAPE || 'https://french-stream.hair';
    const NOTE = process.env.NOTE || '8';
    const GENRES = process.env.GENRES || 'horreur|thriller';

    const arrayOfNote = NOTE.split('|');

    var noteConfig = {};

    if(arrayOfNote.length > 1) {
        noteConfig = createObjectWithMinMax(arrayOfNote[0], arrayOfNote[1]);
    } else if (arrayOfNote.length > 0) {
        noteConfig = createObjectWithMinMax(arrayOfNote[0], '10');
    }

    puppeteer.use(AdblockerPlugin({ blockTrackers: false }))
    puppeteer.use(StealthPlugin())
    puppeteer.use(AnonymizeUa())

    // const CRX_PATH = 'C:\\Users\\Chikara\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\ngpampappnmepgilojfohadhhmbhlaek\\6.42.3_0';


    const browserSetup = {
        "headless": headless,
        "defaultViewport": null,
        "userDataDir": "./profile",
        "ignoreHTTPSErrors": true,
        "args": [
            "--start-maximized",
            // `--disable-extensions-except=${CRX_PATH}`,
            // `--load-extension=${CRX_PATH}`,
            "--disable-web-security", 
            "--allow-pasting",
            "--disable-site-isolation-trials",
            "--disable-features=IsolateOrigins,site-per-process",
            "--netifs-to-ignore=INTERFACE_TO_IGNORE",
            "--enable-automation"
        ]
    }

    var genreSearch = GENRES.split('|');

    var browser = await puppeteer.launch(browserSetup)
    // const context = await browser.createIncognitoBrowserContext();
    var page = await browser.newPage();

    await page.setDefaultTimeout(0)

    var responses = [], init_nbr_page = 1, init_info=0;

    try {  
        var ids = fs.readFileSync('log.txt', 'utf8');
        init_nbr_page = parseInt(ids.split(',')[0]);
        init_info = parseInt(ids.split(',')[1]);
    } catch(e) {
        console.log(`\n--------------------------------------- No log file found -----------------------------\n`);
    }

    try {
        var rawdata = fs.readFileSync('data.json');
        responses = JSON.parse(rawdata);
    } catch (error) {
        
    }

    // return await getMovies();

    for (let i = init_nbr_page; i <= NBR_PAGE; i++) {

        var current_page = i == 1 ? '' : 'page/' + i;

        var proxy_url = USE_WEB_CACHE ? "https://webcache.googleusercontent.com/search?q=cache:" : "";
        
        try {
            await page.goto(proxy_url + URL_TO_SCRAPE + '/xfsearch/version-film/'+current_page, { waitUntil: 'networkidle2' });
        } catch (error) {
            
        }
        // await resolveCloudFlare()
        await page.waitForSelector('#dle-content')
        await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));

        const links = await page.evaluate(() => {
            const linkElements = document.querySelectorAll('#dle-content .short a.short-poster');
            const links = [];
        
            linkElements.forEach(linkElement => {
                links.push(linkElement.href);
            });
        
            return links;
        });

        for (let j = init_info; j < links.length; j++) {
            const link = links[j];

            try {
                await page.goto(proxy_url + link, { waitUntil: 'networkidle2' });
            } catch (error) {
                
            }

            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(`Page : ${chalk.green(i)} \tInfo : ${j+1} \tDonnées : ${chalk.blue(responses.length)}`);

            try {
                await page.waitForSelector('.fr-count.fr-common', {timeout:5000})
            } catch (error) {
                console.log(chalk.red(`\nFilm not found at : Page : ${chalk.green(i)} \tInfo : ${j+1} \tDonnées : ${chalk.blue(responses.length)}`));
                await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));
                continue;
            }
            

            await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));
            
            await scrollDown('#s-list');

            await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));
            
            const genre = await page.evaluate(() => {
                return document.querySelectorAll('#s-list li[rel="nofollow"]')[0]?.innerText?.split(':')[1]
            });

            const title = await page.evaluate(() => {
                return document.querySelectorAll('h1#s-title')[0].innerText
            });

            const note = await page.evaluate(() => {
                return document.querySelectorAll('.fr-count.fr-common')[0]?.innerText?.split('\n')[0]
            });

            const url = await page.url()

            const info = {
                title,
                note,
                genre,
                url
            }

            fs.writeFileSync('log.txt', `${i},${j}`, 'utf8');

            if(!containsObject(info, responses)) {
                if(isDataInText(genreSearch, genre?.toLowerCase())) {
                    if(parseFloat(note) >= noteConfig.start && parseFloat(note) <= noteConfig.end)
                    responses.push(info);
                    fs.writeFileSync('data.json', JSON.stringify(responses, null, 4), 'utf8');
                }
            }

            init_info = 0
        }

        init_nbr_page = 1

    }
    
    console.log(chalk.green(`\n--------------------------------------- Scraping finished -----------------------------\n`));

    function isDataInText(dataArray, searchText) {
        for (let i = 0; i < dataArray.length; i++) {
          if (searchText && searchText.includes(dataArray[i])) {
            return true; // Return true if any element is found in the text
          }
        }
        return false; // Return false if none of the elements are found in the text
    }

    function createObjectWithMinMax(num1, num2) {
        var start = Math.min(parseFloat(num1), parseFloat(num2));
        var end = Math.max(parseFloat(num1), parseFloat(num2));
    
        return { start: start, end: end };
    }


    function containsObject(obj, list) {
        return list.some(elem => JSON.stringify(elem) == JSON.stringify(obj))
    }

    async function click_btn(el)
    {
        await page.waitForSelector(el)
        await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));
        await page.$eval(el, btn => btn.click());
    }

    async function scrollDown(selector) {
        await page.$eval(selector, e => {
            e.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        });
    }

    async function scrollDownElement(el){
        await page.evaluate((e)=>{
            e.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        }, el)
    }

    async function resolveCloudFlare() {
        let tentative  = 5, i=0;
        do {
            await new Promise(r => setTimeout(r, 5000));
            const iframeSelector = 'iframe[src^="https://challenges.cloudflare.com"]';
            await page.waitForSelector(iframeSelector);
            const frame = await page.frames()[1];
            await frame.click('.ctp-checkbox-label'); 
            await page.waitForNavigation({ waitUntil : 'networkidle2' });
            i++;

            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');

            console.log( i +" TENTATIVE");
        } while (i<tentative);
    }

    // Function to download the file with progress tracking
    async function downloadFile(title, url, destination) {
        return new Promise((resolve, reject) => {
            axios.get(url, { responseType: 'stream' })
            .then(response => {
                const writer = fs.createWriteStream(destination);
                response.data.pipe(writer);

                    writer.on('finish', resolve);
                    writer.on('error', reject);
            })
            .then(() => {
                console.log('Video downloaded successfully!');
            })
            .catch(error => {
                console.error('Error downloading video:', error);
            });
        });

        // return new Promise((resolve, reject) => {
        // progress(request(url))
        //     .on('progress', (state) => {
        //         process.stdout.clearLine();
        //         process.stdout.cursorTo(0);
        //         process.stdout.write(`Downloaded ${title} : ${((state.percent)*100).toFixed(2)}%`);
        //     })
        //     .on('error', (err) => {
        //         reject(err);
        //     })
        //     .pipe(fs.createWriteStream(destination))
        //     .on('close', () => {
        //         console.log(`\nDownload ${title} completed!`);
        //         resolve();
        //     });
        // });
    }

    async function getMovies() {
        await page.goto('https://french-stream.hair/15114813-le-dernier-voyage-du-demeter.html', { waitUntil : 'networkidle2'});

        await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));

        await click_btn('.movie_play #gGotop')

        await new Promise(r => setTimeout(r, DEFAULT_TIMEOUT));

        await page.waitForSelector('a[href*="uqload.to"]')

        await page.evaluate(() => {
            for (var i = 0, el; el = document.querySelectorAll('a[href*="uqload.to"]')[i]; i++) {
                var version = el.innerText.trim().toLowerCase();
                if(version.includes('french')) {
                    return el.click();
                }
            }
        })

        await new Promise(r => setTimeout(r, 5000));

        const elementHandle = await page.waitForSelector('iframe');
        const frame = await elementHandle.contentFrame();

        await frame.waitForSelector('video[src]')

        const video_src = await frame.evaluate(() => document.querySelectorAll('video[src]')[0]?.src)
        await frame.click('.player-poster.clickable')

        console.log(video_src);
        await new Promise(r => setTimeout(r, 5000));

        await downloadFile('Séminaire', video_src, 'Seminaire.mp4');
    }
})()