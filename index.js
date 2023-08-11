

import puppeteer from 'puppeteer-extra';

import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import AnonymizeUa from 'puppeteer-extra-plugin-anonymize-ua';

import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

import fs from 'fs'

import chalk from 'chalk';

import dotenv from 'dotenv'

(async () => {

    dotenv.config();

    const headless = process.env.HEADLESS == 'true' || process.env.HEADLESS == '1';
    const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT || '2000');
    const NBR_PAGE = parseInt(process.env.NBR_PAGE || '100');

    puppeteer.use(AdblockerPlugin({ blockTrackers: false }))
    puppeteer.use(StealthPlugin())
    puppeteer.use(AnonymizeUa())

    const browserSetup = {
        "headless": headless,
        "defaultViewport": null,
        "userDataDir": "./profile",
        "ignoreHTTPSErrors": true,
        "args": [
            "--start-maximized",
            "--disable-web-security", 
            "--disable-site-isolation-trials",
            "--disable-features=IsolateOrigins,site-per-process",
            "--netifs-to-ignore=INTERFACE_TO_IGNORE",
            "--disable-dev-shm-usage"
        ],

        "ignoreDefaultArgs": ["--enable-automation"]
    }

    var genreSearch = ['horreur', 'thriller'];

    var browser = await puppeteer.launch(browserSetup)
    var page = await browser.newPage()
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

    for (let i = init_nbr_page; i <= NBR_PAGE; i++) {

        var current_page = i == 1 ? '' : 'page/' + i;

        try {
            await page.goto('https://web.french-stream.bio/xfsearch/version-film/'+current_page, { waitUntil: 'networkidle2' });
        } catch (error) {
            
        }

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
                await page.goto(link, { waitUntil: 'networkidle2' });
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
                return document.querySelectorAll('h1#s-title')[1].innerText
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
                if(isDataInText(genreSearch, genre.toLowerCase()) && parseFloat(note) > 8) {
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
          if (searchText.includes(dataArray[i])) {
            return true; // Return true if any element is found in the text
          }
        }
        return false; // Return false if none of the elements are found in the text
    }


    function containsObject(obj, list) {
        return list.some(elem => JSON.stringify(elem) == JSON.stringify(obj))
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
})()