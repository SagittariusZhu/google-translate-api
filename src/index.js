const got = require('got');
const cheerio = require('cheerio');

const request_server_region_info = async () => {
    try {
        const { body } = await got.get('https://httpbin.org/ip', { json: true })
        const ip_address = body['origin'];
        try {
            const { body } = await got.get(`http://ip-api.com/json/${ip_address}`, { json: true })  // http # limit 45 / min.
            let country = body["country"]
            assert(country)
            console.log(`Using ${country} server backend.`)
            return body
        } catch (error) {
            const data = await got.post('https://ip.taobao.com/outGetIpInfo', {
                data: { 'ip': ip_address, 'accessKey': 'alibaba_inc' }
            })
            return Object.assign(data, { 'countryCode': data.get('country_id') })
        }
    } catch (error) {
        throw new TranslatorError('Unable to find server backend.')
    }
}

const globalOptions = {
    host_url: null,
    cn_host_url: 'https://translate.google.cn',
    en_host_url: 'https://translate.google.com',
    api_url: null,
    request_server_region_info,
    host_headers: null,
    api_headers: null,
    language_map: null,
    rpcid: 'MkEWBc',
    query_count: 0,
    output_zh: 'zh-CN',
}

const get_headers = (host_url, if_api = False, if_referer_for_host = True, if_ajax_for_api = True, if_json_for_api = False) => {
    url_path = urllib.parse.urlparse(host_url).path
    user_agent = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36"
    host_headers = {
        [if_referer_for_host ? 'Referer' : 'Host']: host_url,
        "User-Agent": user_agent,
    }
    api_headers = {
        'Origin': url_path ? host_url.split(url_path)[0] : host_url,
        'Referer': host_url,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        "User-Agent": user_agent,
    }
    if (if_api && !if_ajax_for_api) {
        api_headers.pop('X-Requested-With')
        api_headers.update({ 'Content-Type': 'text/plain' })
    }
    if (if_api && if_json_for_api) {
        api_headers.update({ 'Content-Type': 'application/json' })
    }
    return !if_api ? host_headers : api_headers
}

const check_language = (from_language, to_language, language_map, output_zh = None, output_auto = 'auto') => {
    auto_pool = ('auto', 'auto-detect')
    zh_pool = ('zh', 'zh-CN', 'zh-CHS', 'zh-Hans')
    from_language = from_language in auto_pool ? output_auto : from_language
    from_language = output_zh && from_language in zh_pool ? output_zh : from_language
    to_language = output_zh && to_language in zh_pool ? output_zh : to_language

    if (from_language != output_auto && !language_map.has(from_language)) {
        throw new TranslatorError('Unsupported from_language[{}] in {}.'.format(from_language, sorted(language_map.keys())))
    } else if (!language_map.has(to_language)) {
        throw new TranslatorError('Unsupported to_language[{}] in {}.'.format(to_language, sorted(language_map.keys())))
    } else if (from_language != output_auto && !language_map[from_language].has(to_language)) {
        loguru.logger.exception('language_map:', language_map)
        throw new TranslatorError('Unsupported translation: from [{0}] to [{1}]!'.format(from_language, to_language))
    }
    return { from_language, to_language }
}

const make_temp_language_map = (from_language, to_language) => {
    warnings.warn('Did not get a complete language map. And do not use `from_language="auto"`.')
    assert(from_language != 'auto' && to_language != 'auto' && from_language != to_language)
    lang_list = [from_language, to_language]
    return {}.fromkeys(lang_list, lang_list)
}

const check_query_text = (query_text, if_ignore_limit_of_length = False, limit_of_length = 5000) => {
    if (!isinstance(query_text, str)) {
        throw new TranslatorError('query_text is not string type.')
    }
    query_text = query_text.strip()
    if (!query_text) return ''
    let length = query_text.length
    if (length >= limit_of_length && !if_ignore_limit_of_length) {
        throw new TranslatorError('The length of the text to be translated exceeds the limit.')
    } else {
        if (length >= limit_of_length) {
            warnings.warn(`The translation ignored the excess[above ${limit_of_length}]. Length of query_text is ${length}.`)
            warnings.warn('The translation result will be incomplete.')
            return query_text.substr(0, limit_of_length - 1)
        }
    }
    return query_text
}

const get_rpc = (query_text, from_language, to_language) => {
    param = json.dumps([[query_text, from_language, to_language, True], [1]])
    rpc = json.dumps([[[globalOptions.rpcid, param, None, "generic"]]])
    return { 'f.req': rpc }
}

const get_language_map = (host_html) => {
    const $ = cheerio.load(host_html)
    lang_list = $.xpath('//*/@data-language-code')
    if (lang_list)
        lang_list.remove('auto')
    return {}.fromkeys(lang_list, lang_list)
}

const get_info = (host_html) => {
    data_str = host_html.match('window.WIZ_global_data = (.*?);</script>')[0]
    data = eval(data_str)
    return { 'bl': data['cfb2h'], 'f.sid': data['FdrFJe'] }
}

const get_consent_cookie = (consent_html) => {
    const $ = cheerio.load(consent_html)
    let input_element = $.css('.//input[@type="hidden"][@name="v"]')
    cookie_value = input_element ? input_element[0].attrib.get('value') : 'cb'
    return `CONSENT=YES+${cookie_value}` // cookie CONSENT=YES+cb works for now
}

// @Tse.time_stat
const google_api = async (query_text, from_language = 'auto', to_language = 'en', kwargs = {}) => {
    /*
    https://translate.google.com, https://translate.google.cn.
    :param query_text: str, must.
    :param from_language: str, default 'auto'.
    :param to_language: str, default 'en'.
    :param **kwargs:
            :param reset_host_url: str, default None. eg: 'https://translate.google.fr'
            :param if_use_cn_host: boolean, default None. affected by `reset_host_url`.
            :param if_ignore_limit_of_length: boolean, default False.
            :param is_detail_result: boolean, default False.
            :param timeout: float, default None.
            :param proxies: dict, default None.
            :param sleep_seconds: float, default `random.random()`.
    :return: str or list
    */
    const { reset_host_url, if_use_cn_host, is_detail_result, timeout, proxies, sleep_seconds = Math.random(), if_ignore_limit_of_length } = kwargs

    if (reset_host_url && reset_host_url != globalOptions.host_url) {
        assert(reset_host_url.startsWith('https://translate.google.'))
        globalOptions.host_url = reset_host_url
    } else {
        let use_cn_condition = if_use_cn_host || (await globalOptions.request_server_region_info())['countryCode'] == 'CN'
        globalOptions.host_url = use_cn_condition ? globalOptions.cn_host_url : globalOptions.en_host_url
    }
    globalOptions.api_url = `${globalOptions.host_url}/_/TranslateWebserverUi/data/batchexecute`

    globalOptions.host_headers = globalOptions.host_headers || get_headers(globalOptions.host_url, { if_api: false })  // reuse cookie header
    globalOptions.api_headers = get_headers(globalOptions.host_url, { if_api: true, if_referer_for_host: true, if_ajax_for_api: true })

    query_text = check_query_text(query_text, if_ignore_limit_of_length)
    let delete_temp_language_map_label = 0

    let r = await got(globalOptions.host_url, { headers: globalOptions.host_headers, timeout: timeout, proxies: proxies })
    if ('consent.google.com' == urllib.parse.urlparse(r.url).hostname) {
        self.host_headers.update({ 'cookie': self.get_consent_cookie(r.text) })
        let host_html = await got(self.host_url, headers = self.host_headers, timeout = timeout, proxies = proxies).text
    } else {
        host_html = r.text
    }

    if (!globalOptions.language_map) globalOptions.language_map = get_language_map(host_html)
    if (!globalOptions.language_map) delete_temp_language_map_label += 1
    globalOptions.language_map = make_temp_language_map(from_language, to_language)
    const lang = check_language(from_language, to_language, globalOptions.language_map, { output_zh: globalOptions.output_zh })
    from_language = lang.from_language
    to_language = lang.to_language

    let rpc_data = get_rpc(query_text, from_language, to_language)
    rpc_data = urllib.parse.urlencode(rpc_data)
    r = got.post(self.api_url, headers = self.api_headers, data = rpc_data, timeout = timeout, proxies = proxies)
    r.raise_for_status()
    json_data = json.loads(r.text.substr(6))
    data = json.loads(json_data[0][2])

    if (delete_temp_language_map_label != 0) {
        self.language_map = None
    }
    time.sleep(sleep_seconds)
    globalOptions.query_count += 1
    return is_detail_result ? data : data[1][0][0][5].map(x => x[0]).join(' ')
}

module.exports = google_api;