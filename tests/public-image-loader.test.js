import { fetchPublicCollections, installLazyFirestoreImages } from "../js/public-image-loader.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Deferred public images", () => {
    it("keeps article and book list reads shared and independent of abort signals", async () => {
        const originalFetch = window.fetch;
        const requests = [];
        window.fetch = (input, options) => {
            const url = String(input);
            if (!url.includes("firestore.googleapis.com")) return originalFetch(input, options);
            requests.push({ url, options });
            const collectionName = url.includes("/documents/articles?") ? "articles" : "books";
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    documents: [{
                        name: `projects/test/databases/(default)/documents/${collectionName}/sample`,
                        fields: {
                            title: { stringValue: `Sample ${collectionName}` },
                            status: { stringValue: "published" }
                        }
                    }]
                })
            });
        };

        try {
            const result = await fetchPublicCollections();
            expect(result.articles).to.have.length(1);
            expect(result.books).to.have.length(1);
            expect(requests).to.have.length(2);
            expect(requests.every(request => !request.options?.signal)).to.equal(true);
        } finally {
            window.fetch = originalFetch;
        }
    });

    it("loads covers after they intersect the viewport", function(done) {
        this.timeout(5000);
        const originalFetch = window.fetch;
        const originalIntersectionObserver = window.IntersectionObserver;
        const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z3sAAAAASUVORK5CYII=";
        let imageObserver;

        window.IntersectionObserver = class {
            constructor(callback) {
                this.callback = callback;
                this.targets = [];
                imageObserver = this;
            }
            observe(target) {
                this.targets.push(target);
            }
            unobserve() {}
        };
        window.fetch = (input, options) => {
            if (String(input).includes("firestore.googleapis.com")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        fields: { imageUrl: { stringValue: pixel } }
                    })
                });
            }
            return originalFetch(input, options);
        };

        const container = document.createElement("div");
        const images = [
            { collection: "books", id: "image-loader-book", loading: "eager" },
            { collection: "articles", id: "image-loader-article", loading: "lazy" }
        ].map(({ collection, id, loading }) => {
            const image = document.createElement("img");
            image.dataset.nuqthaImageCollection = collection;
            image.dataset.nuqthaImageDoc = id;
            image.loading = loading;
            image.style.cssText = "position:fixed;left:0;top:0;width:100px;height:100px";
            container.append(image);
            return image;
        });
        const directImage = document.createElement("img");
        directImage.src = pixel;
        directImage.loading = "lazy";
        directImage.dataset.nuqthaCover = "true";
        container.append(directImage);
        document.body.append(container);

        const timeout = setTimeout(() => finish(new Error(`Cover did not load: ${images.map(image => JSON.stringify({
            id: image.dataset.nuqthaImageDoc,
            queued: image.dataset.nuqthaImageQueued,
            observed: image.dataset.nuqthaImageObserved,
            loaded: image.complete && image.naturalWidth > 0,
            bounds: image.getBoundingClientRect().toJSON()
        })).join(", ")}`)), 4500);
        let loadedImages = 0;
        function finish(error) {
            clearTimeout(timeout);
            window.fetch = originalFetch;
            window.IntersectionObserver = originalIntersectionObserver;
            container.remove();
            if (error) done(error);
            else done();
        }

        images.forEach(image => image.addEventListener("load", () => {
            try {
                expect(image.naturalWidth).to.be.greaterThan(0);
                loadedImages += 1;
                if (loadedImages === images.length) finish();
            } catch (error) {
                finish(error);
            }
        }, { once: true }));

        installLazyFirestoreImages();
        setTimeout(() => {
            try {
                expect(images.every(image => image.dataset.nuqthaImageQueued !== "true")).to.equal(true);
                expect(directImage.loading).to.equal("lazy");
                imageObserver.callback(imageObserver.targets.map(target => ({ target, isIntersecting: true })));
            } catch (error) {
                finish(error);
            }
        }, 0);
    });
});
