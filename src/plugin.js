/* global THREE, AFRAME */

const Handlebars = require('handlebars');
const RecastConfig = require('./recast-config');
const panelTpl = require('./plugin.html');
const GeometryReducer = require('./three-geometry-reducer');
const OBJExporter = require('../lib/OBJExporter');

require('./components/nav-debug-pointer');
require('./plugin.scss');

// import AWS object without services
var AWS = require('aws-sdk/global');
// import individual service
var S3 = require('aws-sdk/clients/s3');


// import { FBAppDatabase } from '../firebaseInit.js'
const dbFirebase = require('./FirebaseApp.js')

var firebase = require('firebase');


class RecastError extends Error {}



/**
 * Recast navigation mesh plugin.
 */
class RecastPlugin {
  constructor(panelEl, sceneEl, host, expiration) {
    this.panelEl = panelEl;
    this.sceneEl = sceneEl;
    this.spinnerEl = panelEl.querySelector('.recast-spinner');
    this.settings = {};
    this.navMesh = null;
    this.host = host;
    this.bindListeners();
    this.expiration = expiration

    // this.bucketName = 'tensor-objects'
    // this.s3 = new S3({
    //   apiVersion: '2006-03-01',
    //   params: { Bucket: this.bucketName }
    // });

    this.dbFirebase = dbFirebase





    this.user = firebase.auth().currentUser;
    console.log('The user is:')
    console.log(this.user)






    // this.currentWorld = "el_clon_29"
    // this.ref = dbFirebase.ref('el_clon_29') //this.state.universe);
    this.objectId = 'nav-mesh' //jsonified.id //Date.now()




    console.log('the cognito token in plugin is:')
    console.log(window.COGNITO_TOKEN)
    AWS.config.region = 'us-east-2';
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: 'us-east-2:dfec3483-aade-48a4-b2d1-40a142000817',
      // IdentityId: AWS.config.credentials.identityId, //AWS.config.credentials.params.IdentityId,
      Logins: {
        'cognito-identity.amazonaws.com': window.COGNITO_TOKEN
      }

    });
    // // obtain credentials
    // AWS.config.credentials.get(function(err) {
    //   if (!err) {
    console.log('Cognito Identity Id: ' + AWS.config.credentials.identityId);
    //     console.log('CONGRATS, PLUGIN CAN ACCESS AWS')

    this.bucketName = 'tensor-objects'
    this.s3 = new S3({
      apiVersion: '2006-03-01',
      params: { Bucket: this.bucketName }
    });
    console.log('this.s3 is:')
    console.log(this.s3)

    //   }
    //   else {
    //     console.log('THERE WAS AN ERROR buddy')
    //   }
    // })
  }

  /** Attach event listeners to the panel DOM. */
  bindListeners() {
    const settings = this.settings;

    // Update labels when sliders change.
    RecastConfig.forEach(({ name }) => {
      const input = this.panelEl.querySelector(`input[name=${name}]`);
      settings[name] = input.value;
      input.addEventListener('input', () => {
        settings[name] = Number(input.value);
      });
    });

    // Rebuild.
    const rebuildBtnEl = this.panelEl.querySelector('[name=build]');
    rebuildBtnEl.addEventListener('click', () => this.rebuild());

    // Export.
    const exportBtnEl = this.panelEl.querySelector('[name=export]');
    exportBtnEl.addEventListener('click', () => this.exportGLTF());
  }

  /**
   * Convert the current scene to an OBJ, rebuild the navigation mesh, and show
   * a preview of the navigation mesh in the scene.
   */
  rebuild() {
    this.validateForm();

    this.clearNavMesh();
    const body = this.serializeScene();
    const loader = new THREE.OBJLoader();
    const params = this.serialize(this.settings);

    this.showSpinner();
    fetch(`${this.host}/v1/build/?${params}`, { method: 'post', body: body })
      .then((response) => response.json())
      .then((json) => {
        if (!json.ok) throw new RecastError(json.message);

        const navMeshGroup = loader.parse(json.obj);
        const meshes = [];

        navMeshGroup.traverse((node) => {
          if (node.isMesh) meshes.push(node);
        });

        if (meshes.length !== 1) {
          console.warn('[aframe-inspector-plugin-recast] Expected 1 navmesh but got ' + meshes.length);
          if (meshes.length === 0) return;
        }

        if (this.navMesh) this.sceneEl.object3D.remove(this.navMesh);

        this.navMesh = meshes[0];
        this.navMesh.material = new THREE.MeshNormalMaterial();
        this.injectNavMesh(this.navMesh);

        // Delay resolving, so first render blocks hiding the spinner.
        return new Promise((resolve) => setTimeout(resolve, 30));
      })
      .catch((e) => {
        console.error(e);
        e instanceof RecastError
          ?
          window.alert(e.message) :
          window.alert('Oops, something went wrong.');
      })
      .then(() => {
        this.hideSpinner()
        this.exportGLTF()

        this.uploadNavMesh()
      });


  }

  /** Validate all form inputs. */
  validateForm() {
    const form = this.panelEl.querySelector('.panel-content');
    if (!form.checkValidity()) {
      this.fail('Please correct errors navmesh configuration.');
    }
  }

  /**
   * Collect all (or selected) objects from scene.
   * @return {FormData}
   */
  serializeScene() {
    // const selectorInput = this.panelEl.querySelector(`input[name=selector]`);
    // const selector = selectorInput.value;
    const selector = 'A-GRID,a-entity:not(.exclude_from_nav_mesh)'

    this.sceneEl.object3D.updateMatrixWorld();
    this.markInspectorNodes();

    const reducer = new GeometryReducer({ ignore: /^[XYZE]+|picker$/ });

    if (selector) {

      const selected = this.sceneEl.querySelectorAll(selector);
      const visited = new Set();

      [].forEach.call(selected, (el) => {
        if (!el.object3D) return;
        el.object3D.traverse((node) => {
          if (visited.has(node)) return;
          reducer.add(node);
          visited.add(node);
        });
      });

    }
    else {

      this.sceneEl.object3D.traverse((o) => reducer.add(o));

    }

    console.info('Pruned scene graph:');
    this.printGraph(reducer.getBuildList());

    const { position, index } = reducer.reduce();

    // Convert vertices and index to Blobs, add to FormData, and return.
    const positionBlob = new Blob([new Float32Array(position)], { type: 'application/octet-stream' });
    const indexBlob = new Blob([new Int32Array(index)], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('position', positionBlob);
    formData.append('index', indexBlob);
    return formData;

  }

  /**
   * Attempt to pre-mark inspector-injected nodes. Unfortunately
   * there is no reliable way to do this; we have to assume the first
   * object named 'picker' is one of them, walk up the tree, and mark
   * everything below its root.
   */
  //////THIS WAS MODIFIED BY JAFET
  ///YOU SHOULD BE MARKING THE PLAYER SO THAT HE IS NOT EVALUATED BY THE PLUGIN AS PART OF THE ARCHITECTURE
  markInspectorNodes() {
    // const scene = this.sceneEl.object3D;
    // let inspectorNode = scene.getObjectByName('picker');
    // while (inspectorNode.parent !== scene) inspectorNode = inspectorNode.parent;
    // inspectorNode.traverse((node) => {
    //   node.userData._isInspectorNode = true;
    // });
  }

  /**
   * Injects navigation mesh into the scene, creating entity if needed.
   * @param  {THREE.Mesh} navMesh
   */
  injectNavMesh(navMesh) {
    let navMeshEl = this.sceneEl.querySelector('[nav-mesh]');
    if (!navMeshEl) {
      navMeshEl = document.createElement('a-entity');
      navMeshEl.setAttribute('nav-mesh', 'DUMMY_STRING_BRO');
      navMeshEl.setAttribute('id', 'nav-mesh');
      navMeshEl.setAttribute('class', 'exclude_from_nav_mesh');
      navMeshEl.setAttribute('visible', 'false');
      // navMeshEl.setAttribute('color','808080')
      this.sceneEl.appendChild(navMeshEl);
    }
    setTimeout(() => {
      navMeshEl.setObject3D('mesh', navMesh);
      const navMeshComponent = navMeshEl.components['nav-mesh'];
      if (navMeshComponent) navMeshComponent.loadNavMesh();
    }, 20);
  }

  /** Removes navigation mesh, if any, from scene. */
  clearNavMesh() {
    const navMeshEl = this.sceneEl.querySelector('[nav-mesh]');
    if (navMeshEl) navMeshEl.removeObject3D('mesh');
  }

  /** Export to glTF 2.0. */
  exportGLTF() {
    if (!this.navMesh) throw new Error('[RecastPlugin] No navigation mesh.');
    const exporter = new THREE.GLTFExporter();
    const backupMaterial = this.navMesh.material;
    this.navMesh.material = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0, roughness: 1 });
    exporter.parse(this.navMesh, (gltfContent) => {
      this.navMesh.material = backupMaterial;
      this._download('navmesh.gltf', JSON.stringify(gltfContent));
    }, { binary: false });
  }

  /** Export to OBJ. */
  exportOBJ() {
    if (!this.navMesh) throw new Error('[RecastPlugin] No navigation mesh.');
    const exporter = new OBJExporter();
    this._download('navmesh.obj', exporter.parse(this.navMesh));
  }

  /** Upload nav mesh. */
  uploadNavMesh() {
    if (!this.navMesh) throw new Error('[RecastPlugin] No navigation mesh.');
    const exporter = new THREE.GLTFExporter();
    const backupMaterial = this.navMesh.material;
    this.navMesh.material = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0, roughness: 1 });
    exporter.parse(this.navMesh, (gltfContent) => {
      this.navMesh.material = backupMaterial;
      const data = JSON.stringify(gltfContent)
      const fileName = 'navmesh' + (new Date().getTime())


      console.log('this.s3 is:')
      console.log(this.s3)
      const cognitoIdentityId = AWS.config.credentials.identityId
      var folderKey = 'navs/' + cognitoIdentityId + '/' + 'navmesh_' + (new Date().getTime()) + '.gltf'


      // this.s3.getSignedUrl('putObject',{
      //   Bucket: this.bucketName,
      //   Key: folderKey,
      //   // ContentType: 'data:text/plain;charset=utf-8',
      //   Body: 'body'//data//
      //   // ACL: 'private' //OTHER TYPES OF ACLS THAT ARE MORE PUBLIC SHOULD THROW BACK AN UNAUTHORIZED ERROR
      //   //   ,
      //   // ContentMD5: 'false',
      //   // Expires: 604800
      //   // }, function(err, data) {
      // }, function(err, url) {
      //   if (err) {
      //     console.log('error is')
      //     console.log(err)
      //     return alert('There was an error creating your album: ' + err.message);
      //   }
      //   alert('Successfully uploaded new navmesh named:' + fileName);
      //   console.log('the url is:')
      //   console.log(url)
      //   this.ref.child("entities").child(this.objectId).child('gltf-model').set("url(" + url + ")").then(function() {})
      // }.bind(this));





      this.s3.upload({
        // this.s3.getSignedUrl('putObject', {
        Bucket: this.bucketName,
        Key: folderKey,
        ContentType: 'data:text/plain;charset=utf-8',
        Body: data,
        ACL: 'private' //OTHER TYPES OF ACLS THAT ARE MORE PUBLIC SHOULD THROW BACK AN UNAUTHORIZED ERROR
        //   ,
        // ContentMD5: 'false',
        // Expires: 604800
        // }, function(err, data) {
      }, function(err, url) {
        if (err) {
          console.log('error is')
          console.log(err)
          return alert('There was an error creating your album: ' + err.message);
        }
        // alert('Successfully uploaded new navmesh named:' + fileName);
        console.log('the url is:')
        console.log(url)

        var params = { Bucket: this.bucketName, Key: folderKey, Expires: this.expiration };
        var url = this.s3.getSignedUrl('getObject', params);
        console.log('The URL is', url);






        //     var user = firebase.auth().currentUser;
        //     console.log('The user is:')
        //     console.log(user)
        //     this.dbFirebase.ref("users").child(user.uid).child("currentWorld").once("value").then(function(snapshot) {
        //       const currentWorld = snapshot.toJSON();
        //       console.log('this is what was read')
        //       console.log(currentWorld)
        //     // this.dbFirebase.ref(currentWorld).child("entities").child(this.objectId).child('gltf-model').set("url(" + url + ")").then(function() {})
        // }.bind(this))

        this.dbFirebase.ref("users").child(this.user.uid).child("currentWorld").once("value").then(function(snapshot) {
          this.user.currentWorld = snapshot.toJSON();
          console.log('this is what was read')
          console.log(this.user.currentWorld)
          // this.dbFirebase.ref(currentWorld).child("entities").child(this.objectId).child('gltf-model').set("url(" + url + ")").then(function() {})
          this.dbFirebase.ref(this.user.currentWorld).child("entities").child(this.objectId).child('gltf-model').set("url(" + url + ")").then(function() {})
        }.bind(this))




      }.bind(this));



    }, { binary: false });
  }

  /**
   * Start a nav mesh download from the user's browser.
   * @param  {string} filename
   * @param  {string} content
   */
  _download(filename, content) {
    const el = document.createElement('a');
    el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    el.setAttribute('download', filename);
    el.style.display = 'none';

    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
  }

  /**
   * Prints debug graph of a scene subtree.
   * @param  {THREE.Object3D} node
   */
  printGraph(node) {

    console.group(' <' + node.type + '> ' + node.name);
    node.children.forEach((child) => this.printGraph(child));
    console.groupEnd();

  }

  /**
   * Converts an object to URI query parameters.
   * @param  {Object<string, *>} obj
   * @return {string}
   */
  serialize(obj) {
    const str = [];
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]));
      }
    }
    return str.join('&');
  }

  /**
   * Sets visibility of the plugin panel.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.panelEl.style.display = visible ? '' : 'none';
  }

  /** Shows the loading spinner. */
  showSpinner() {
    this.spinnerEl.classList.add('active');
  }

  /** Hides the loading spinner. */
  hideSpinner() {
    this.spinnerEl.classList.remove('active');
  }

  /**
   * Displays a user-facing message then throws an error.
   * @param {string} msg
   */
  fail(msg) {
    window.alert(msg);
    throw new Error(msg);
  }
}

/**
 * Plugin component wrapper.
 *
 * The A-Frame Inspector does not technically have a plugin
 * API, and so we use this component to detect events (play/pause) indicating
 * that the inspector is (probably) opened or closed.
 */
AFRAME.registerComponent('inspector-plugin-recast', {
  schema: {
    serviceURL: { default: 'https://recast-api.donmccurdy.com' },
    linkExpiration: { default: 604800 },
    interval: { default: 60 }
  },
  init: function() {
    const wrapEl = document.createElement('div');
    const template = Handlebars.compile(panelTpl);
    wrapEl.innerHTML = template({ RecastConfig: RecastConfig });
    const panelEl = wrapEl.children[0];
    document.body.appendChild(panelEl);
    this.plugin = new RecastPlugin(panelEl, this.el, this.data.serviceURL, this.data.linkExpiration);
  },
  pause: function() {
    // this.plugin.setVisible(true);
    console.log('ABOUT TO CLEAR THE INTERVAL')
    clearInterval(this.rebuildIntervalId)
  },
  play: function() {
    this.plugin.setVisible(false);



    //     function timeout() {
    //     setTimeout(function () {
    //         // Do Something Here
    //         // Then recall the parent function to
    //         // create a recursive loop.
    //         timeout();
    //       this.render() 
    //     }.bind(this), this.data.expiration*1000);
    // }



    this.rebuildIntervalId = setInterval(function() {
      console.log('this.render is::::')
      console.log(this.render)
      // this.plugin.rebuild() 
      this.render()
    }.bind(this), this.data.interval * 1000);


  },
  render: function() {
    this.plugin.rebuild()
  },
  remove: function() {
    console.log('ABOUT TO CLEAR THE INTERVAL')
    clearInterval(this.rebuildIntervalId)
  }

});
