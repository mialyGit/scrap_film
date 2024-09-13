import { connect } from 'puppeteer-real-browser'
import dotenv from 'dotenv';
import fs from 'fs';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import chalk from 'chalk';

(async () => {
    
    /** 
     * 
     * @type {import("puppeteer-real-browser").Options}
     */
    const realBrowserOption = {
        headless: false,
        args: ["--start-maximized"],
        connectOption: {
            defaultViewport: null
        },
        skipTarget: [],
        fingerprint: false,
        turnstile: true,
        fpconfig: {},
        plugins: [
            AdblockerPlugin({ blockTrackers: false })
        ]

        // proxy:{
        //     host:'<proxy-host>',
        //     port:'<proxy-port>',
        //     username:'<proxy-username>',
        //     password:'<proxy-password>'
        // }
    };


    const {browser, page} = await connect(realBrowserOption)
    

    dotenv.config();

    const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT || '2000');
    const NBR_PAGE = parseInt(process.env.NBR_PAGE || '100');
    const URL_TO_SCRAPE = process.env.URL_TO_SCRAPE || 'https://vvw.french-stream.bio';
    const NOTE = process.env.NOTE || '8';
    const GENRES = process.env.GENRES || 'horreur|thriller';

    const arrayOfNote = NOTE.split('|');
    var genreSearch = GENRES.split('|');

    var noteConfig = {};

    if(arrayOfNote.length > 1) {
        noteConfig = createObjectWithMinMax(arrayOfNote[0], arrayOfNote[1]);
    } else if (arrayOfNote.length > 0) {
        noteConfig = createObjectWithMinMax(arrayOfNote[0], '10');
    }

    await page.setDefaultTimeout(0)
    await page.setDefaultNavigationTimeout(0)

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
            await page.goto(URL_TO_SCRAPE + '/'+current_page, { waitUntil: 'domcontentloaded' });
        } catch (error) {
            console.log(error);
            
        }
        
        if(i == init_nbr_page) {
            await waitForCloudflareResolved(15000)
        }

        await page.waitForSelector('#dle-content')

        await sleep(DEFAULT_TIMEOUT)

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

            fs.writeFileSync('log.txt', `${i},${j}`, 'utf8');

            try {
                await page.waitForSelector('.fr-count.fr-common', {timeout:5000})
            } catch (error) {
                console.log(chalk.red(`\nFilm not found at : Page : ${chalk.green(i)} \tInfo : ${j+1} \tDonnées : ${chalk.blue(responses.length)}`));
                await sleep(DEFAULT_TIMEOUT)
                continue;
            }
            
            await scrollDown('#s-list');

            await sleep(DEFAULT_TIMEOUT)

            const note = await page.evaluate(() => {
                return document.querySelectorAll('.fr-count.fr-common')[0]?.innerText?.split('\n')[0]
            });

            if(!!!(parseFloat(note) >= noteConfig.start && parseFloat(note) <= noteConfig.end)) {
                continue;
            }
            
            const genre = await page.evaluate(() => {
                return document.querySelectorAll('#s-list li[rel="nofollow"]')[0]?.innerText?.split(':')[1]
            });

            if(!!!(isDataInText(genreSearch, genre?.toLowerCase()))) {
                continue;
            }

            const title = await page.evaluate(() => {
                for (var h1 of document.querySelectorAll('h1')) {
                    const title = h1.innerText?.trim()
                    if(title) return title
                }
                return '';
            });

            const version = await page.evaluate(() => {
                return document.querySelectorAll('#film_lang')[0]?.innerText?.trim()
            });

            const date_sortie = (await get_text_from_xpath('//li[span[contains(text(), "Date de sortie")]]'))?.split(':').pop().trim();

            const video_embed = await getVideoEmbedUrl()

            const url = await page.url()

            const info = {
                title,
                note,
                genre,
                version,
                date_sortie,
                video_embed,
                url
            }

            if(!!!containsObject(info, responses)) {             
                responses.push(info);
                fs.writeFileSync('data.json', JSON.stringify(responses, null, 4), 'utf8');
            }

            //  else {
            //     responses = responses.map(item => {
            //         return { ...item, info: { ...info } };
            //     });
            //     fs.writeFileSync('data.json', JSON.stringify(responses, null, 4), 'utf8');
            // }

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

    function sleep(ms) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    }

    function createObjectWithMinMax(num1, num2) {
        var start = Math.min(parseFloat(num1), parseFloat(num2));
        var end = Math.max(parseFloat(num1), parseFloat(num2));
    
        return { start: start, end: end };
    }


    function containsObject(obj, list, key = "url") {
        return list.some(elem => elem[key] == obj[key])
    }

    async function waitForCloudflareResolved(timeout = 30000) {
        let verify = null
        let startDate = Date.now()
        while (!verify && (Date.now() - startDate) < timeout) {
            verify = await page.evaluate(() => { return document.querySelector('.link_row') ? true : null }).catch(() => null)
            await new Promise(r => setTimeout(r, 1000)); 
        }
    }


    async function scrollDown(selector) {
        await page.$eval(selector, e => {
            e.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        });
    }

    async function get_text_from_xpath(xpath) {
        await page.waitForSelector('::-p-xpath('+xpath+')');
        return await page.evaluate((xp) => {
            const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (result) {
              return result.textContent;
            }
            return null;
          }, xpath);
    }

    async function click_btn(el)
    {
        await page.waitForSelector(el)
        await sleep(DEFAULT_TIMEOUT);
        await page.$eval(el, btn => btn.click());
    }

    async function getVideoEmbedUrl() {
        await click_btn('.movie_play #gGotop')
        await sleep(DEFAULT_TIMEOUT);
        await page.waitForSelector('a[href*="uqload"]')

        return await page.evaluate(() => {
            for (var i = 0, el; el = document.querySelectorAll('a[href*="uqload"]')[i]; i++) {
                var version = el.innerText?.trim()?.toLowerCase();
                if(version.includes('french')) {
                    return el.href;
                }
            }
            return ''
        })
    }

})()
