const VERSION = "v2",
      OFFLINE_PAGE = "offline.html",
      SVG_OFFLINE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><path fill="#d3d3d3" fill-rule="evenodd" d="M0 0h500v500H0z"/><g font-family="SegoeUI, Segoe UI" font-size="33" style="isolation:isolate"><text style="isolation:isolate" transform="translate(105.6 243.2)">Network interrupted,</text><text style="isolation:isolate" transform="translate(104.2 284.2)">media not loaded</text></g></svg>',
      SVG_SLOW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><path fill="#d3d3d3" fill-rule="evenodd" d="M0 0h500v500H0z"/><g font-family="SegoeUI, Segoe UI" font-size="33" style="isolation:isolate"><text style="isolation:isolate" transform="translate(105.6 243.2)">Data saver active,</text><text style="isolation:isolate" transform="translate(104.2 284.2)">media not loaded</text></g></svg>';

var slow_connection = false,
    save_data = false,
    last_tested = null;

function testConnection() {
  // only test every minute
  if ( last_tested && Date.now() < last_tested + ( 60 * 1000 ) )
  {
    return;
  }
  if ( 'connection' in navigator ) {
    slow_connection = ( navigator.connection.downlink < 0.5 );
    save_data = navigator.connection.saveData;
    console.log( "Currently slow?", slow_connection, "Currently wanting to save data?", save_data );
    last_tested = Date.now();
  }
}

function cacheResponse( response, event ) {
  console.log( "caching a recently fetched copy of", event.request.url );
  event.waitUntil(
    caches.open( VERSION ).then( cache => {
      return cache.put( event.request, response );
    })
  );
  return response.clone();
}

function newImageResponse( svg ) {
  return new Response( svg, {
    headers: { 'Content-Type': 'image/svg+xml' }
  });
}

self.addEventListener( "install", function( event ){
  event.waitUntil(
    caches.open( VERSION ).then(function(cache) {
      return cache.addAll([
        "/css/main.css",
        "/js/main.js",
        OFFLINE_PAGE
      ]);
    })
  );

  self.skipWaiting();
});

self.addEventListener( "activate", event => {
  // clean up stale caches
  event.waitUntil(
    caches.keys()
      .then( keys => {
        return Promise.all(
          keys
            .filter( key => {
              return ! key.startsWith( VERSION );
            })
            .map( key => {
              return caches.delete( key );
            })
        );
      })
  );

  clients.claim();
});

self.addEventListener( "fetch", function( event ){

  testConnection();

  let request = event.request,
      url = request.url;

  // EXTENSIONS!
  if ( /^chrome\-extension/.test(url) ) { return; }
  
  // handle HTML - Network first
  if ( request.mode === "navigate" )
  {
    console.log( "Navigation request", url );
    event.respondWith(
      fetch( request )
        .then( response => cacheResponse( response, event ) )
        .catch( () => {
          console.log("whoops, fetch failed…", url);
          return caches.match( request )
            .then( cached_result => {
              if ( cached_result ) {
                console.log('Wait! Found a cached copy', url);
                return cached_result;
              }
              console.log('Fetch failed; returning offline page', url);
              return caches.match( OFFLINE_PAGE );
          });
        })
    );
  }

  // CSS & JavaScript - Cache first
  else if ( /\.css$/.test(url) || /\.js$/.test(url) )
  {
    console.log("CSS or JavaScript request", url);
    event.respondWith(
      caches.match( request )
        .then( cached_result => {
          // cached first
          if ( cached_result ) {
            console.log( "Found a cache match", url );
            return cached_result;
          }
          // fallback to network
          return fetch( request )
            .then( response => cacheResponse( response, event ) )
            // fail
            .catch(
              new Response( "", {
                status: 408,
                statusText: "The server appears to be offline."
              })
            );
      })
    );
  }

  // images - cache first, network if not slow/save data
  else if ( request.headers.get("Accept").includes("image") )
  {
    console.log("Image request", url);
    event.respondWith(
      caches.match( request )
        .then( cached_result => {
          // cached first
          if ( cached_result ) {
            console.log( "Found a cache match", url );
            return cached_result;
          }
          // fallback to network
          if ( ! slow_connection && ! save_data )
          {
            console.log("fetch images normally", url);
            return fetch( request )
              .then( response => cacheResponse( response, event ) )
              // fail
              .catch( () => newImageResponse( SVG_OFFLINE ) );
          }
          else
          {
            console.log( "slow connection or saving data", url );
            return newImageResponse( SVG_SLOW );
          }
      })
    );

  }

});
