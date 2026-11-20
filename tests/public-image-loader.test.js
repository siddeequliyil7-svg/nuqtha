import { fetchPublicCollections, installLazyFirestoreImages } from "../js/public-image-loader.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Deferred public images", () => {
    it("queries only published article and book records", async () => {
        const originalFetch = window.fetch;
        const queries = [];
        window.fetch = async (input, options = {}) => {
            if (!String(input).includes(":runQuery")) return originalFetch(input, options);
            const body = JSON.parse(options.body);
            queries.push(body.structuredQuery);
            return { ok: true, json: async () => [] };
        };

        try {
            const collections = await fetchPublicCollections();
            expect(collections.articles).to.deep.equal([]);
            expect(collections.books).to.deep.equal([]);
            expect(queries).to.have.length(2);
            queries.forEach(query => {
                expect(query.where.fieldFilter.field.fieldPath).to.equal("status");
                expect(query.where.fieldFilter.value.stringValue).to.equal("published");
            });
        } finally {
            window.fetch = originalFetch;
        }
    });

    it("loads visible covers even when IntersectionObserver does not notify", function(done) {
        this.timeout(5000);
        const originalFetch = window.fetch;
        const originalIntersectionObserver = window.IntersectionObserver;
        const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z3sAAAAASUVORK5CYII=";

        window.IntersectionObserver = class {
            observe() {}
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
    });

    it("replaces broken direct cover URLs with the local fallback image", function(done) {
        this.timeout(5000);
        installLazyFirestoreImages();
        const image = document.createElement("img");
        image.dataset.nuqthaCover = "true";
        image.src = "/missing-cover-image-test.png";
        document.body.append(image);

        const timeout = Date.now() + 4500;
        const checkFallback = () => {
            if (image.getAttribute("src") === "/cover-placeholder.svg") {
                image.remove();
                done();
                return;
            }
            if (Date.now() >= timeout) {
                image.remove();
                done(new Error("Broken cover was not replaced with the local fallback."));
                return;
            }
            setTimeout(checkFallback, 20);
        };
        checkFallback();
    });
});
