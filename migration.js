const wpEndpoint = `https://jonashcroft.co.uk/wp-json/wp/v2/`

const axios = require('axios')
const fs = require('fs');

// API Endpoints we want to get data from
let wpData = {
  'posts': [],
  'tags': [],
  'categories': [],
  'media': []
};

let apiData = {}

const wpFields = {
  // 'type': {
  //   'contentful_id': 'blogPost',
  //   'value': 'post',
  //   'requiresExtra': false
  // },
  'title': {
    'contentful_id': 'postTitle',
    'value': '',
    'requiresExtra': false
  },
  'slug': {
    'contentful_id': 'slug',
    'value': '',
    'requiresExtra': false
  },
  'content': {
    'contentful_id': 'content',
    'value': '',
    'requiresExtra': false
  },
  'date': {
    'contentful_id': 'publishedAt',
    'value': '',
    'requiresExtra': false
  },
  'featured_media': {
    'contentful_id': 'featuredImage',
    'value': '',
    'requiresExtra': true
  },
  'tags': {
    'contentful_id': 'tags',
    'value': '',
    'requiresExtra': true
  },
  'categories': {
    'contentful_id': 'categories',
    'value': '',
    'requiresExtra': true
  }
}
// Object.freeze(wpFields)

function migrateContent() {
  let promises = [];

  // Loop over our content types and create API endpoint URLs
  for (const [key, value] of Object.entries(wpData)) {
    let wpUrl = `${wpEndpoint}${key}?per_page=90`
    promises.push(wpUrl)
  }

  // console.log(promises)
  getAllData(promises)
    .then(response =>{
      apiData = response

      mapData();

    }).catch(error => {
      console.log(error)
    })
}

function getAllData(URLs){
  return Promise.all(URLs.map(fetchData));
}

function fetchData(URL) {
  return axios
    .get(URL)
    .then(function(response) {
      return {
        success: true,
        endpoint: '',
        data: response.data
      };
    })
    .catch(function(error) {
      return { success: false };
    });
}

// Get our entire API response and filter it down to only show content that we want to include
function mapData() {
  // Loop over our conjoined data structure and append data types to each child.
  for (const [index, [key, value]] of Object.entries(Object.entries(wpData))) {
    apiData[index].endpoint = key
  }

  reducePostData();
  // assignValueToTags();
}

function assignValueToTags() {
  console.log(`Assigning string values to post tag IDs`)
  let apiTags = getApiDataType('tags')

  console.log(apiTags);

  for (const [key, post] of Object.entries(wpData.posts)) {
    // console.log(key)
    // console.log(post)

    console.log(post.tags)
  }
}

function reducePostData() {
  console.log(`Reducing posts API data to only include fields we want`)
  // Get WP posts from API
  let apiPosts = getApiDataType('posts')[0];
  // Loop over posts
  for (let [key, postData] of Object.entries(apiPosts.data)) {
    // Create base object with only limited keys (e.g. just 'slug', 'categories', 'title') etc.
    let fieldData = {
      id: postData.id,
      type: postData.type,
      postTitle: postData.title.rendered,
      slug: postData.slug,
      content: postData.content.rendered,
      publishedAt: postData.date_gmt + '+00:00',
      featuredImage: getPostFeaturedMedia(postData.featured_media),
      tags: getPostLabels(postData.tags, 'tags'),
      categories: getPostLabels(postData.categories, 'categories'),
      contentImages: getPostBodyImages(postData)
    }

    wpData.posts.push(fieldData)
  }

  console.log(`...Done!`)
  writeDataToFile()
}

function getPostFeaturedMedia(postMedia) {
  let featuredMedia = {}
  console.log(postMedia)

  if (postMedia === 0) {
    return featuredMedia
  }
  let mediaData = getApiDataType(`media`)[0];


  let mediaObj = mediaData.data.filter(obj => {
    if (obj.id === postMedia) {
      return obj
    }
  })[0];

  // console.log(mediaData[0].id)
  console.log(mediaObj.id)

  featuredMedia = {
    link: mediaObj.source_url,
    description: mediaObj.alt_text,
    title:  mediaObj.alt_text,
    postId: mediaObj.post
  }

  console.log(featuredMedia)

  return featuredMedia
}

function getPostBodyImages(postData) {
  let imageRegex = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g
  let bodyImages = []

  // console.log(imageRegex.exec(postData.content.rendered))
  while (foundImage = imageRegex.exec(postData.content.rendered)) {
    let alt = foundImage[0].split('alt="')[1].split('"')[0]

    bodyImages.push({
      link: foundImage[1],
      description: alt,
      title: alt,
      postId: postData.id
    })
  }
  return bodyImages
}

function getPostLabels(postItems, labelType) {
  let labels = []
  let apiTag = getApiDataType(labelType)[0];

  for (const labelId of postItems) {
    let labelName = apiTag.data.filter(obj => {
      if (obj.id === labelId) {
        return obj.name
      }
    });

    labels.push(labelName[0].name)
  }

  return labels
}

// Helper function to get a specific data tree for a type of resource.
function getApiDataType(resourceName) {
  let test = apiData.filter(obj => {
    if (obj.endpoint === resourceName) {
      return obj
    }
  });
  return test

}

function writeDataToFile() {
  console.log(`Writing data to a file`)

  fs.writeFile(`./posts.json`, JSON.stringify(wpData, null, 2), (err) => {
    if (err) {
        console.error(err);
        return;
    };
    console.log(`...Done!`)
});

}

migrateContent();
