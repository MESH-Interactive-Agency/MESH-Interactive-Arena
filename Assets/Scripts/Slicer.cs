using UnityEngine;
using EzySlice;
using System.Collections;
using System.Collections.Generic;

public class Slicer : MonoBehaviour
{
    public Material materialAfterSlice;
    public LayerMask sliceMask;
    public bool isTouched;
    private int slices = 0;
    private void Update()
    {
        if (isTouched == true)
        {
            isTouched = false;

            Collider[] objectsToBeSliced = Physics.OverlapBox(transform.position, new Vector3(1, 0.1f, 0.1f), transform.rotation, sliceMask);

            foreach (Collider objectToBeSliced in objectsToBeSliced)
            {
                SlicedHull slicedObject = SliceObject(objectToBeSliced.gameObject, materialAfterSlice);

                GameObject upperHullGameobject = slicedObject.CreateUpperHull(objectToBeSliced.gameObject, materialAfterSlice);
                GameObject lowerHullGameobject = slicedObject.CreateLowerHull(objectToBeSliced.gameObject, materialAfterSlice);

                upperHullGameobject.transform.position = objectToBeSliced.transform.position;
                lowerHullGameobject.transform.position = objectToBeSliced.transform.position;

                upperHullGameobject.transform.rotation = objectToBeSliced.transform.rotation;
                lowerHullGameobject.transform.rotation = objectToBeSliced.transform.rotation;

                MakeItPhysical(upperHullGameobject);
                MakeItPhysical(lowerHullGameobject);


                Destroy(objectToBeSliced.gameObject);

            }
        }
    }

    private void MakeItPhysical(GameObject obj)
    {
        obj.AddComponent<MeshCollider>().convex = true;
        obj.AddComponent<Rigidbody>();
        obj.GetComponent<Rigidbody>().useGravity = true;
        obj.GetComponent<Rigidbody>().velocity = Vector3.down*1.5f;
        obj.layer = 13;
        
        //StartCoroutine(DropThrough(obj));
        StartCoroutine(DestroyDebris(obj));

        IEnumerator DestroyDebris(GameObject o)
        {
            yield return new WaitForSeconds(1.0f);
            Destroy(o);

        }
        // IEnumerator DropThrough(GameObject o)
        // {
        //     yield return new WaitForSeconds(0.2f);
        //     Destroy(o.GetComponent<BoxCollider>());
        // }
        
    }

    private SlicedHull SliceObject(GameObject obj, Material crossSectionMaterial = null)
    {
        return obj.Slice(transform.position, transform.up, crossSectionMaterial);
    }


}
